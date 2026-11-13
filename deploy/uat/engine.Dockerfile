# xRules Engine Hub (Rust) — UAT image. HTTP :50051 (/api/v1/health), gRPC :50060. Stateless.
FROM rust:1.93.1-slim-bookworm AS build
RUN apt-get update && apt-get install -y --no-install-recommends pkg-config libssl-dev protobuf-compiler && rm -rf /var/lib/apt/lists/*
WORKDIR /src
COPY apps/xrules-engine/ ./
RUN rm -rf target && cargo build --release --locked

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates tini tzdata && rm -rf /var/lib/apt/lists/* \
 && useradd -r -u 10001 app
ENV TZ=Asia/Bangkok PORT=50051 GRPC_PORT=50060 RUST_LOG=info
COPY --from=build /src/target/release/xrules-engine /usr/local/bin/xrules-engine
USER app
EXPOSE 50051 50060
ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["/usr/local/bin/xrules-engine"]
