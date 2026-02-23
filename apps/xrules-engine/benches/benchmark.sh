#!/bin/bash

# XRules Engine Benchmark Script
# Compares HTTP vs gRPC performance

echo "XRules Engine Benchmark"
echo "======================="
echo ""

# Configuration
HTTP_URL="http://localhost:50051/api/v1/health"
GRPC_URL="localhost:50060"
ITERATIONS=1000

echo "Configuration:"
echo "  HTTP URL: $HTTP_URL"
echo "  gRPC URL: $GRPC_URL"
echo "  Iterations: $ITERATIONS"
echo ""

# HTTP Benchmark
echo "Running HTTP benchmark..."
echo "-------------------------"

HTTP_START=$(date +%s%N)
for i in $(seq 1 $ITERATIONS); do
    curl -s $HTTP_URL > /dev/null
done
HTTP_END=$(date +%s%N)

HTTP_DURATION=$(( ($HTTP_END - $HTTP_START) / 1000000 ))  # Convert to ms
HTTP_AVG=$(echo "scale=2; $HTTP_DURATION / $ITERATIONS" | bc)
HTTP_RPS=$(echo "scale=0; $ITERATIONS * 1000 / $HTTP_DURATION" | bc)

echo "  Total time: ${HTTP_DURATION}ms"
echo "  Avg latency: ${HTTP_AVG}ms"
echo "  Requests/sec: $HTTP_RPS"
echo ""

# gRPC Benchmark
echo "Running gRPC benchmark..."
echo "-------------------------"

# Check if grpcurl is available
if command -v grpcurl &> /dev/null; then
    GRPC_START=$(date +%s%N)
    for i in $(seq 1 $ITERATIONS); do
        grpcurl -plaintext $GRPC_URL xrules.engine.v1.EngineService/HealthCheck > /dev/null 2>&1
    done
    GRPC_END=$(date +%s%N)
    
    GRPC_DURATION=$(( ($GRPC_END - $GRPC_START) / 1000000 ))
    GRPC_AVG=$(echo "scale=2; $GRPC_DURATION / $ITERATIONS" | bc)
    GRPC_RPS=$(echo "scale=0; $ITERATIONS * 1000 / $GRPC_DURATION" | bc)
    
    echo "  Total time: ${GRPC_DURATION}ms"
    echo "  Avg latency: ${GRPC_AVG}ms"
    echo "  Requests/sec: $GRPC_RPS"
    echo ""
    
    # Summary
    echo "Summary"
    echo "-------"
    echo "  HTTP:  $HTTP_RPS req/s (avg ${HTTP_AVG}ms)"
    echo "  gRPC:  $GRPC_RPS req/s (avg ${GRPC_AVG}ms)"
    
    SPEEDUP=$(echo "scale=1; $GRPC_RPS * 100 / $HTTP_RPS" | bc)
    echo "  gRPC is ${SPEEDUP}% of HTTP speed"
else
    echo "  grpcurl not installed. Install with: brew install grpcurl"
    echo ""
fi
