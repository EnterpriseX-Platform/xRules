#!/usr/bin/env Rscript

# XRules PMML Engine
# R-based statistical model server supporting PMML 4.4
# Port: 50052

library(plumber)
library(pmml)
library(r2pmml)
library(XML)
library(jsonlite)
library(logger)

# Configure logging
log_threshold(DEBUG)
log_info("Starting XRules PMML Engine...")

# Source service modules
source("R/pmml_service.R")
source("R/health.R")
source("R/validation.R")

#* @apiTitle XRules PMML Engine
#* @apiDescription R-based statistical model execution engine supporting PMML 4.4
#* @apiVersion 0.1.0
#* @apiContact XRules Team - https://github.com/xrules/platform

#* Health check endpoint
#* @get /health
#* @serializer json
function() {
  list(
    status = "healthy",
    service = "pmml-engine",
    version = "0.1.0",
    standards = c("PMML 4.4", "DMG 4.4"),
    models_loaded = get_loaded_models_count(),
    uptime = as.numeric(Sys.time()) - get_startup_time()
  )
}

#* Execute PMML model scoring
#* @post /execute
#* @serializer json
#* @param rule JSON object containing model info and input data
function(req) {
  tryCatch({
    body <- fromJSON(req$postBody, simplifyDataFrame = FALSE)
    
    # Validate request
    validation_result <- validate_execute_request(body)
    if (!validation_result$valid) {
      return(list(
        success = FALSE,
        error = validation_result$error,
        output = NULL
      ))
    }
    
    # Extract rule definition and input
    rule <- body$rule
    input <- body$input
    
    log_info("Executing PMML model for rule: {rule$id}")
    
    # Get model path or PMML content
    pmml_content <- get_pmml_content(rule$definition)
    
    if (is.null(pmml_content)) {
      return(list(
        success = FALSE,
        error = "PMML content not found in rule definition",
        output = NULL
      ))
    }
    
    # Parse PMML and score
    start_time <- Sys.time()
    result <- score_pmml_model(pmml_content, input)
    end_time <- Sys.time()
    
    duration_ms <- as.numeric(end_time - start_time) * 1000
    
    if (result$success) {
      list(
        success = TRUE,
        output = result$prediction,
        error = NULL,
        duration_ms = round(duration_ms, 2),
        engine_used = "pmml"
      )
    } else {
      list(
        success = FALSE,
        output = NULL,
        error = result$error,
        duration_ms = round(duration_ms, 2)
      )
    }
    
  }, error = function(e) {
    log_error("Execution error: {conditionMessage(e)}")
    list(
      success = FALSE,
      output = NULL,
      error = conditionMessage(e)
    )
  })
}

#* Load a PMML model
#* @post /models/load
#* @serializer json
#* @param model_path Path to PMML file or raw PMML content
function(req) {
  tryCatch({
    body <- fromJSON(req$postBody)
    
    if (!is.null(body$model_path)) {
      result <- load_pmml_from_file(body$model_path)
    } else if (!is.null(body$pmml_content)) {
      result <- load_pmml_from_string(body$pmml_content)
    } else {
      return(list(
        success = FALSE,
        error = "Either model_path or pmml_content must be provided"
      ))
    }
    
    result
    
  }, error = function(e) {
    log_error("Load model error: {conditionMessage(e)}")
    list(
      success = FALSE,
      error = conditionMessage(e)
    )
  })
}

#* List loaded models
#* @get /models
#* @serializer json
function() {
  list(
    success = TRUE,
    models = get_loaded_models()
  )
}

#* Unload a model
#* @delete /models/<model_id>
#* @serializer json
function(model_id) {
  result <- unload_model(model_id)
  result
}

#* Validate PMML content
#* @post /validate
#* @serializer json
#* @param pmml_content Raw PMML XML content
function(req) {
  tryCatch({
    body <- fromJSON(req$postBody)
    
    if (is.null(body$pmml_content)) {
      return(list(
        valid = FALSE,
        errors = list("pmml_content is required")
      ))
    }
    
    validate_pmml_content(body$pmml_content)
    
  }, error = function(e) {
    list(
      valid = FALSE,
      errors = list(conditionMessage(e))
    )
  })
}

#* Get model metadata
#* @get /models/<model_id>/metadata
#* @serializer json
function(model_id) {
  get_model_metadata(model_id)
}

#* Predict with specific model
#* @post /models/<model_id>/predict
#* @serializer json
#* @param input Input data for prediction
function(model_id, req) {
  tryCatch({
    body <- fromJSON(req$postBody)
    input <- body$input
    
    if (is.null(input)) {
      return(list(
        success = FALSE,
        error = "input is required"
      ))
    }
    
    result <- predict_with_model(model_id, input)
    result
    
  }, error = function(e) {
    log_error("Prediction error: {conditionMessage(e)}")
    list(
      success = FALSE,
      error = conditionMessage(e)
    )
  })
}

#* Get supported PMML model types
#* @get /supported-types
#* @serializer json
function() {
  list(
    success = TRUE,
    model_types = c(
      "RegressionModel",
      "GeneralRegressionModel",
      "TreeModel",
      "NeuralNetwork",
      "SupportVectorMachineModel",
      "ClusteringModel",
      "MiningModel",
      "Scorecard"
    ),
    pmml_version = "4.4"
  )
}

# Global variables for model storage
startup_time <- as.numeric(Sys.time())
loaded_models <- new.env()

get_startup_time <- function() {
  startup_time
}

get_loaded_models_count <- function() {
  length(ls(loaded_models))
}

get_loaded_models <- function() {
  model_list <- list()
  for (name in ls(loaded_models)) {
    model_list[[name]] <- list(
      id = name,
      loaded_at = loaded_models[[name]]$loaded_at,
      model_type = loaded_models[[name]]$model_type
    )
  }
  model_list
}

# Start the plumber API
pr <- plumb("plumber.R")
port <- as.numeric(Sys.getenv("PORT", "50052"))
host <- Sys.getenv("HOST", "0.0.0.0")

log_info("PMML Engine starting on {host}:{port}")
pr$run(host = host, port = port)
