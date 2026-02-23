# Health Check Module

library(logger)

#' Check PMML engine health
#' @return Health status object
check_health <- function() {
  list(
    status = "healthy",
    timestamp = as.character(Sys.time()),
    version = "0.1.0",
    r_version = R.version.string,
    models_loaded = length(ls(loaded_models)),
    memory_usage = get_memory_usage()
  )
}

#' Get memory usage
#' @return Memory usage in MB
get_memory_usage <- function() {
  tryCatch({
    mem <- gc()
    total <- sum(mem[, 2])  # Ncells + Vcells in MB
    round(total, 2)
  }, error = function(e) {
    NA
  })
}
