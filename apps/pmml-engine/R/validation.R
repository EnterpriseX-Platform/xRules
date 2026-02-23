# Validation Module

library(XML)
library(logger)

#' Validate execute request
#' @param body Request body
#' @return Validation result
validate_execute_request <- function(body) {
  errors <- list()
  
  if (is.null(body$rule)) {
    errors <- append(errors, "rule is required")
  }
  
  if (is.null(body$input)) {
    errors <- append(errors, "input is required")
  }
  
  if (length(errors) > 0) {
    return(list(
      valid = FALSE,
      error = paste(unlist(errors), collapse = "; ")
    ))
  }
  
  list(valid = TRUE)
}

#' Validate PMML content
#' @param pmml_content PMML XML content
#' @return Validation result
validate_pmml_content <- function(pmml_content) {
  tryCatch({
    # Parse XML
    doc <- xmlParse(pmml_content, asText = TRUE)
    
    # Check PMML version
    root <- xmlRoot(doc)
    version <- xmlGetAttr(root, "version", "unknown")
    
    # Check for required elements
    errors <- list()
    
    # Check Header
    header <- xmlChildren(root)[["Header"]]
    if (is.null(header)) {
      errors <- append(errors, "Missing Header element")
    }
    
    # Check DataDictionary or DataField
    data_dict <- xmlChildren(root)[["DataDictionary"]]
    if (is.null(data_dict)) {
      errors <- append(errors, "Missing DataDictionary element")
    }
    
    # Check for at least one model
    model_types <- c("RegressionModel", "TreeModel", "NeuralNetwork", 
                     "GeneralRegressionModel", "SupportVectorMachineModel",
                     "ClusteringModel", "MiningModel", "Scorecard")
    
    has_model <- FALSE
    for (model_type in model_types) {
      if (!is.null(xmlChildren(root)[[model_type]])) {
        has_model <- TRUE
        break
      }
    }
    
    if (!has_model) {
      errors <- append(errors, "No valid model element found")
    }
    
    if (length(errors) > 0) {
      return(list(
        valid = FALSE,
        errors = errors,
        version = version
      ))
    }
    
    list(
      valid = TRUE,
      version = version,
      message = "PMML content is valid"
    )
    
  }, error = function(e) {
    list(
      valid = FALSE,
      errors = list(paste("XML parsing error:", conditionMessage(e)))
    )
  })
}
