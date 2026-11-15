"""xRules ML service — data preparation, training, evaluation and prediction (TOR 4.13.1).

Stateless HTTP service called only by the xRules API. Rows come in as JSON records; trained models go back
as a base64 joblib artifact that the API stores with the model version. Predictions cache loaded artifacts
by version id, so the API sends the artifact only when the service asks for it (409 need_artifact).

  POST /profile   column stats, outliers (IQR / z), correlation matrix, feature relevance to a target
  POST /prepare   apply steps (minmax, standard, robust, center, outliers, drop, keep, derive) → rows + fitted params
  POST /train     preprocessing + algorithm in one sklearn Pipeline, split, optional grid/random search → metrics, artifact
  POST /predict   rows → predictions (+ probabilities / cluster) using a cached artifact
"""
from __future__ import annotations

import base64
import io
import math
import time
from typing import Any

import joblib
import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from sklearn.cluster import KMeans
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import GradientBoostingClassifier, GradientBoostingRegressor, RandomForestClassifier, RandomForestRegressor
from sklearn.feature_selection import mutual_info_classif, mutual_info_regression
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LinearRegression, LogisticRegression, Ridge
from sklearn.metrics import (accuracy_score, confusion_matrix, f1_score, mean_absolute_error, mean_squared_error,
                             precision_score, r2_score, recall_score, roc_auc_score, silhouette_score)
from sklearn.model_selection import GridSearchCV, RandomizedSearchCV, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import MinMaxScaler, OneHotEncoder, RobustScaler, StandardScaler
from sklearn.tree import DecisionTreeClassifier, DecisionTreeRegressor

app = FastAPI(title="xrules-ml", version="1.0.0")

# ---------------------------------------------------------------- catalogue (UI builds its forms from this)
ALGORITHMS: dict[str, dict[str, Any]] = {
    "linear_regression":   {"task": "regression",     "label": "Linear regression",   "cls": LinearRegression, "params": {}},
    "ridge":               {"task": "regression",     "label": "Ridge regression",    "cls": Ridge, "params": {"alpha": {"type": "float", "default": 1.0, "min": 0}}},
    "decision_tree_reg":   {"task": "regression",     "label": "Decision tree",       "cls": DecisionTreeRegressor, "params": {"max_depth": {"type": "int", "default": 5, "min": 1}, "min_samples_leaf": {"type": "int", "default": 1, "min": 1}}},
    "random_forest_reg":   {"task": "regression",     "label": "Random forest",       "cls": RandomForestRegressor, "params": {"n_estimators": {"type": "int", "default": 200, "min": 10}, "max_depth": {"type": "int", "default": 8, "min": 1}}},
    "gradient_boosting_reg": {"task": "regression",   "label": "Gradient boosting",   "cls": GradientBoostingRegressor, "params": {"n_estimators": {"type": "int", "default": 200, "min": 10}, "learning_rate": {"type": "float", "default": 0.05, "min": 0.001}, "max_depth": {"type": "int", "default": 3, "min": 1}}},
    "logistic_regression": {"task": "classification", "label": "Logistic regression", "cls": LogisticRegression, "params": {"C": {"type": "float", "default": 1.0, "min": 0.0001}, "max_iter": {"type": "int", "default": 1000, "min": 100}}},
    "decision_tree":       {"task": "classification", "label": "Decision tree",       "cls": DecisionTreeClassifier, "params": {"max_depth": {"type": "int", "default": 5, "min": 1}, "min_samples_leaf": {"type": "int", "default": 1, "min": 1}}},
    "random_forest":       {"task": "classification", "label": "Random forest",       "cls": RandomForestClassifier, "params": {"n_estimators": {"type": "int", "default": 200, "min": 10}, "max_depth": {"type": "int", "default": 8, "min": 1}}},
    "gradient_boosting":   {"task": "classification", "label": "Gradient boosting",   "cls": GradientBoostingClassifier, "params": {"n_estimators": {"type": "int", "default": 200, "min": 10}, "learning_rate": {"type": "float", "default": 0.05, "min": 0.001}, "max_depth": {"type": "int", "default": 3, "min": 1}}},
    "kmeans":              {"task": "clustering",     "label": "K-means clustering",  "cls": KMeans, "params": {"n_clusters": {"type": "int", "default": 4, "min": 2}}},
}
SCALERS = {"minmax": MinMaxScaler, "standard": StandardScaler, "robust": RobustScaler, "center": lambda: StandardScaler(with_std=False), "none": None}


@app.get("/health")
def health():
    return {"status": "ok", "service": "xrules-ml", "sklearn": __import__("sklearn").__version__}


@app.get("/catalogue")
def catalogue():
    return {"algorithms": [{"id": k, "task": v["task"], "label": v["label"], "params": v["params"]} for k, v in ALGORITHMS.items()],
            "scalers": list(SCALERS.keys())}


def _clean(v: Any) -> Any:
    if isinstance(v, (np.floating, float)):
        return None if (math.isnan(v) or math.isinf(v)) else round(float(v), 6)
    if isinstance(v, np.integer):
        return int(v)
    if isinstance(v, dict):
        return {k: _clean(x) for k, x in v.items()}
    if isinstance(v, (list, tuple)):
        return [_clean(x) for x in v]
    return v


def _frame(rows: list[dict]) -> pd.DataFrame:
    if not rows:
        raise HTTPException(400, "No rows")
    df = pd.DataFrame(rows)
    for c in df.columns:  # numbers arrive as strings from CSV/Excel snapshots
        conv = pd.to_numeric(df[c], errors="coerce")
        if conv.notna().sum() >= max(1, int(0.9 * df[c].notna().sum())):
            df[c] = conv
    return df


# ---------------------------------------------------------------- profile (4.13.1.1 / 4.13.1.2)
class ProfileIn(BaseModel):
    rows: list[dict]
    target: str | None = None
    outlier: str = "iqr"          # iqr | zscore


@app.post("/profile")
def profile(body: ProfileIn):
    df = _frame(body.rows)
    num = df.select_dtypes(include="number")
    cols = []
    for c in df.columns:
        s = df[c]
        info: dict[str, Any] = {"name": c, "type": "number" if c in num.columns else "text", "missing": int(s.isna().sum()), "unique": int(s.nunique())}
        if c in num.columns and s.notna().any():
            q1, q3 = s.quantile(0.25), s.quantile(0.75)
            if body.outlier == "zscore":
                z = (s - s.mean()) / (s.std() or 1)
                mask = z.abs() > 3
            else:
                iqr = q3 - q1
                mask = (s < q1 - 1.5 * iqr) | (s > q3 + 1.5 * iqr)
            info.update(min=s.min(), max=s.max(), mean=s.mean(), std=s.std(), q1=q1, median=s.median(), q3=q3,
                        outliers=int(mask.sum()), outlierRows=[int(i) for i in s[mask].index[:20]])
        cols.append(info)
    corr = num.corr().round(4) if num.shape[1] > 1 else pd.DataFrame()
    relevance = None
    if body.target and body.target in df.columns:
        X = num.drop(columns=[body.target], errors="ignore").fillna(num.median(numeric_only=True))
        y = df[body.target]
        if X.shape[1]:
            if y.dtype.kind in "fi" and y.nunique() > 10:
                mi = mutual_info_regression(X, y.fillna(y.median()), random_state=0)
            else:
                mi = mutual_info_classif(X, y.astype(str), random_state=0)
            relevance = sorted([{"feature": f, "score": float(v)} for f, v in zip(X.columns, mi)], key=lambda r: -r["score"])
    return _clean({"rows": len(df), "columns": cols, "correlation": {"columns": list(corr.columns), "matrix": corr.values.tolist()}, "relevance": relevance})


# ---------------------------------------------------------------- prepare (4.13.1.1 – 4.13.1.3)
class Step(BaseModel):
    op: str                        # minmax | standard | robust | center | outliers | drop | keep | derive | fillna
    columns: list[str] = Field(default_factory=list)
    method: str | None = None      # outliers: iqr | zscore ; fillna: mean | median | zero
    action: str | None = None      # outliers: remove | clip | flag
    name: str | None = None        # derive
    expr: str | None = None        # derive: pandas eval expression, e.g. "amount / qty"


class PrepareIn(BaseModel):
    rows: list[dict]
    steps: list[Step]


@app.post("/prepare")
def prepare(body: PrepareIn):
    df = _frame(body.rows)
    fitted: list[dict] = []
    for st in body.steps:
        cols = [c for c in st.columns if c in df.columns]
        if st.op in ("minmax", "standard", "robust", "center"):
            if not cols:
                raise HTTPException(400, f"{st.op}: choose numeric columns")
            sc = SCALERS[st.op]()
            df[cols] = sc.fit_transform(df[cols])
            p: dict[str, Any] = {"op": st.op, "columns": cols}
            for attr in ("data_min_", "data_max_", "mean_", "scale_", "center_"):
                if hasattr(sc, attr) and getattr(sc, attr) is not None:
                    p[attr.rstrip("_")] = np.asarray(getattr(sc, attr)).tolist()
            fitted.append(p)
        elif st.op == "outliers":
            keep = pd.Series(True, index=df.index); flag = pd.Series(False, index=df.index)
            for c in cols:
                s = df[c]
                if (st.method or "iqr") == "zscore":
                    mu, sd = s.mean(), (s.std() or 1); lo, hi = mu - 3 * sd, mu + 3 * sd
                else:
                    q1, q3 = s.quantile(0.25), s.quantile(0.75); iqr = q3 - q1; lo, hi = q1 - 1.5 * iqr, q3 + 1.5 * iqr
                out = (s < lo) | (s > hi)
                if st.action == "clip":
                    df[c] = s.clip(lo, hi)
                elif st.action == "flag":
                    flag |= out
                else:
                    keep &= ~out
                fitted.append({"op": "outliers", "column": c, "low": lo, "high": hi, "found": int(out.sum()), "action": st.action or "remove"})
            if st.action == "flag":
                df["_outlier"] = flag
            df = df[keep].reset_index(drop=True)
        elif st.op == "drop":
            df = df.drop(columns=cols)
        elif st.op == "keep":
            df = df[cols]
        elif st.op == "fillna":
            for c in cols:
                v = 0 if st.method == "zero" else (df[c].median() if st.method == "median" else df[c].mean())
                df[c] = df[c].fillna(v)
        elif st.op == "derive":
            if not st.name or not st.expr:
                raise HTTPException(400, "derive needs name and expr")
            try:
                df[st.name] = df.eval(st.expr, engine="python")
            except Exception as e:  # noqa: BLE001
                raise HTTPException(400, f"derive {st.name}: {e}")
        else:
            raise HTTPException(400, f"Unknown step {st.op}")
    return _clean({"rows": df.replace({np.nan: None}).to_dict(orient="records"), "columns": list(df.columns), "fitted": fitted})


# ---------------------------------------------------------------- train + evaluate (4.13.1.4 – 4.13.1.7)
class TrainIn(BaseModel):
    rows: list[dict]
    algorithm: str
    target: str | None = None
    features: list[str]
    params: dict[str, Any] = Field(default_factory=dict)
    scaler: str = "standard"                 # minmax | standard | robust | center | none
    testSize: float = 0.2
    search: dict[str, Any] | None = None     # {"type": "grid"|"random", "params": {"max_depth": [3,5,8]}, "cv": 3, "iterations": 10}
    seed: int = 42


def _cast_params(algo: dict, params: dict) -> dict:
    out = {}
    for k, v in params.items():
        spec = algo["params"].get(k)
        if spec is None or v in (None, ""):
            continue
        out[k] = int(v) if spec["type"] == "int" else float(v)
    return out


def _pipeline(df: pd.DataFrame, features: list[str], scaler: str, model) -> Pipeline:
    num = [c for c in features if pd.api.types.is_numeric_dtype(df[c])]
    cat = [c for c in features if c not in num]
    steps = []
    if num:
        sc = SCALERS.get(scaler)
        steps.append(("num", Pipeline([("impute", SimpleImputer(strategy="median"))] + ([("scale", sc())] if sc else [])), num))
    if cat:
        steps.append(("cat", Pipeline([("impute", SimpleImputer(strategy="most_frequent")), ("onehot", OneHotEncoder(handle_unknown="ignore"))]), cat))
    return Pipeline([("prep", ColumnTransformer(steps)), ("model", model)])


def _importance(pipe: Pipeline, features: list[str]) -> list[dict]:
    model = pipe.named_steps["model"]
    try:
        names = list(pipe.named_steps["prep"].get_feature_names_out())
    except Exception:  # noqa: BLE001
        names = features
    vals = None
    if hasattr(model, "feature_importances_"):
        vals = model.feature_importances_
    elif hasattr(model, "coef_"):
        c = np.asarray(model.coef_)
        vals = np.abs(c).mean(axis=0) if c.ndim > 1 else np.abs(c)
    if vals is None or len(vals) != len(names):
        return []
    tot = float(np.sum(vals)) or 1.0
    return sorted([{"feature": n.split("__", 1)[-1], "score": float(v) / tot} for n, v in zip(names, vals)], key=lambda r: -r["score"])[:30]


@app.post("/train")
def train(body: TrainIn):
    t0 = time.time()
    algo = ALGORITHMS.get(body.algorithm)
    if not algo:
        raise HTTPException(400, f"Unknown algorithm {body.algorithm}")
    df = _frame(body.rows)
    missing = [c for c in body.features + ([body.target] if body.target else []) if c not in df.columns]
    if missing:
        raise HTTPException(400, f"Columns not in the data: {', '.join(missing)}")
    task = algo["task"]
    if task != "clustering" and not body.target:
        raise HTTPException(400, "Choose the target column")
    df = df.dropna(subset=[body.target]) if body.target else df
    if len(df) < 10:
        raise HTTPException(400, f"Need at least 10 rows with a target value (have {len(df)})")
    params = _cast_params(algo, body.params)
    if task in ("classification", "clustering") or body.algorithm in ("random_forest_reg", "gradient_boosting_reg", "decision_tree_reg"):
        if "random_state" in algo["cls"]().get_params():
            params.setdefault("random_state", body.seed)
    if body.algorithm == "kmeans":
        params.setdefault("n_init", 10)
    pipe = _pipeline(df, body.features, body.scaler, algo["cls"](**params))
    X = df[body.features]
    report: dict[str, Any] = {"task": task, "algorithm": body.algorithm, "rows": len(df), "features": body.features, "scaler": body.scaler, "params": params}

    if task == "clustering":
        pipe.fit(X)
        labels = pipe.named_steps["model"].labels_
        Xt = pipe.named_steps["prep"].transform(X)
        report["metrics"] = {"silhouette": float(silhouette_score(Xt, labels)) if len(set(labels)) > 1 else None, "inertia": float(pipe.named_steps["model"].inertia_)}
        report["clusters"] = [{"cluster": int(k), "size": int(v)} for k, v in zip(*np.unique(labels, return_counts=True))]
    else:
        y = df[body.target]
        if task == "classification":
            y = y.astype(str)
        strat = y if task == "classification" and y.value_counts().min() >= 2 else None
        Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=body.testSize, random_state=body.seed, stratify=strat)
        if body.search and body.search.get("params"):
            grid = {f"model__{k}": v for k, v in body.search["params"].items()}
            cv = int(body.search.get("cv", 3))
            scoring = "f1_weighted" if task == "classification" else "r2"
            if body.search.get("type") == "random":
                s = RandomizedSearchCV(pipe, grid, n_iter=int(body.search.get("iterations", 10)), cv=cv, scoring=scoring, random_state=body.seed)
            else:
                s = GridSearchCV(pipe, grid, cv=cv, scoring=scoring)
            s.fit(Xtr, ytr)
            pipe = s.best_estimator_
            report["search"] = {"type": body.search.get("type", "grid"), "best": {k.replace("model__", ""): v for k, v in s.best_params_.items()}, "bestScore": float(s.best_score_), "tried": len(s.cv_results_["params"])}
            report["params"] = {**params, **report["search"]["best"]}
        else:
            pipe.fit(Xtr, ytr)
        pred = pipe.predict(Xte)
        report["split"] = {"train": len(Xtr), "test": len(Xte)}
        if task == "classification":
            labels = sorted(y.unique().tolist())
            m = {"accuracy": accuracy_score(yte, pred), "precision": precision_score(yte, pred, average="weighted", zero_division=0),
                 "recall": recall_score(yte, pred, average="weighted", zero_division=0), "f1": f1_score(yte, pred, average="weighted", zero_division=0)}
            if len(labels) == 2 and hasattr(pipe, "predict_proba"):
                try:
                    m["auc"] = roc_auc_score(yte, pipe.predict_proba(Xte)[:, 1])
                except Exception:  # noqa: BLE001
                    pass
            report["metrics"] = m
            report["confusion"] = {"labels": labels, "matrix": confusion_matrix(yte, pred, labels=labels).tolist()}
        else:
            report["metrics"] = {"mae": mean_absolute_error(yte, pred), "rmse": math.sqrt(mean_squared_error(yte, pred)), "r2": r2_score(yte, pred)}
            report["samples"] = [{"actual": float(a), "predicted": float(p)} for a, p in list(zip(yte.tolist(), pred.tolist()))[:200]]
        report["importance"] = _importance(pipe, body.features)
    report["trainMs"] = int((time.time() - t0) * 1000)
    buf = io.BytesIO(); joblib.dump({"pipeline": pipe, "features": body.features, "task": task}, buf)
    return JSONResponse(_clean({"report": report, "artifact": base64.b64encode(buf.getvalue()).decode()}))


# ---------------------------------------------------------------- predict
_cache: dict[str, dict] = {}


class PredictIn(BaseModel):
    versionId: str
    rows: list[dict]
    artifact: str | None = None


@app.post("/predict")
def predict(body: PredictIn):
    m = _cache.get(body.versionId)
    if m is None:
        if not body.artifact:
            return JSONResponse({"error": "need_artifact"}, status_code=409)
        m = joblib.load(io.BytesIO(base64.b64decode(body.artifact)))
        if len(_cache) > 50:
            _cache.pop(next(iter(_cache)))
        _cache[body.versionId] = m
    df = _frame(body.rows)
    missing = [c for c in m["features"] if c not in df.columns]
    if missing:
        raise HTTPException(400, f"Missing input fields: {', '.join(missing)}")
    pipe: Pipeline = m["pipeline"]
    pred = pipe.predict(df[m["features"]])
    out = []
    proba = pipe.predict_proba(df[m["features"]]) if m["task"] == "classification" and hasattr(pipe, "predict_proba") else None
    classes = list(pipe.classes_) if proba is not None else None
    for i, p in enumerate(pred):
        r: dict[str, Any] = {"prediction": p.item() if hasattr(p, "item") else p}
        if proba is not None:
            r["probability"] = float(max(proba[i])); r["probabilities"] = {str(c): float(v) for c, v in zip(classes, proba[i])}
        out.append(r)
    return _clean({"results": out})
