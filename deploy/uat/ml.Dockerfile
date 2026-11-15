# xRules ML service (scikit-learn) — UAT image. HTTP :4600 (/health). Stateless; artifacts live in the API's database.
FROM python:3.12-slim
ENV PYTHONDONTWRITEBYTECODE=1 PYTHONUNBUFFERED=1 TZ=Asia/Bangkok
RUN apt-get update && apt-get install -y --no-install-recommends tini tzdata && rm -rf /var/lib/apt/lists/* && useradd -r -u 10002 app
WORKDIR /app
COPY apps/xrules-ml/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY apps/xrules-ml/app.py .
USER app
EXPOSE 4600
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "4600", "--workers", "2"]
