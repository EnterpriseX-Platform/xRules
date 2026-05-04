# Build stage
FROM rust:1.75-alpine AS build
RUN apk add --no-cache musl-dev pkgconfig openssl-dev protobuf
WORKDIR /app

# Cache deps
COPY Cargo.toml Cargo.lock ./
COPY build.rs ./
COPY proto ./proto
RUN mkdir src && echo 'fn main(){}' > src/main.rs && cargo build --release && rm -rf src target/release/xrules-engine target/release/xrules-engine.d

COPY src ./src
RUN touch src/main.rs && cargo build --release

# Runtime
FROM alpine:3.19
RUN apk add --no-cache ca-certificates tini libgcc
WORKDIR /app
COPY --from=build /app/target/release/xrules-engine /usr/local/bin/xrules-engine

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://localhost:50051/health || exit 1

EXPOSE 50051 50060
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["/usr/local/bin/xrules-engine"]
