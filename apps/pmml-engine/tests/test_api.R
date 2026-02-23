# Test script for PMML Engine API

library(httr)
library(jsonlite)

BASE_URL <- "http://localhost:50052"

test_health <- function() {
  cat("Testing /health...\n")
  res <- GET(paste0(BASE_URL, "/health"))
  cat("Status:", status_code(res), "\n")
  cat("Response:", content(res, "text"), "\n\n")
}

test_supported_types <- function() {
  cat("Testing /supported-types...\n")
  res <- GET(paste0(BASE_URL, "/supported-types"))
  cat("Status:", status_code(res), "\n")
  cat("Response:", content(res, "text"), "\n\n")
}

test_load_model <- function() {
  cat("Testing /models/load...\n")
  body <- list(model_path = "models/sample_regression.pmml")
  res <- POST(
    paste0(BASE_URL, "/models/load"),
    body = body,
    encode = "json"
  )
  cat("Status:", status_code(res), "\n")
  cat("Response:", content(res, "text"), "\n\n")
  content(res)
}

test_list_models <- function() {
  cat("Testing /models...\n")
  res <- GET(paste0(BASE_URL, "/models"))
  cat("Status:", status_code(res), "\n")
  cat("Response:", content(res, "text"), "\n\n")
}

test_validate_pmml <- function() {
  cat("Testing /validate...\n")
  pmml_content <- readLines("models/sample_regression.pmml", warn = FALSE)
  body <- list(pmml_content = paste(pmml_content, collapse = "\n"))
  res <- POST(
    paste0(BASE_URL, "/validate"),
    body = body,
    encode = "json"
  )
  cat("Status:", status_code(res), "\n")
  cat("Response:", content(res, "text"), "\n\n")
}

test_execute <- function() {
  cat("Testing /execute...\n")
  pmml_content <- readLines("models/sample_regression.pmml", warn = FALSE)
  
  body <- list(
    rule = list(
      id = "test-rule",
      definition = list(
        pmml = paste(pmml_content, collapse = "\n")
      )
    ),
    input = list(
      age = 30,
      income = 60000,
      credit_score = 750
    )
  )
  
  res <- POST(
    paste0(BASE_URL, "/execute"),
    body = body,
    encode = "json"
  )
  cat("Status:", status_code(res), "\n")
  cat("Response:", content(res, "text"), "\n\n")
}

# Run all tests
run_tests <- function() {
  cat("=== XRules PMML Engine Tests ===\n\n")
  
  tryCatch({
    test_health()
    test_supported_types()
    test_validate_pmml()
    test_load_model()
    test_list_models()
    test_execute()
    
    cat("=== All tests completed ===\n")
  }, error = function(e) {
    cat("Test failed:", conditionMessage(e), "\n")
  })
}

run_tests()
