-- Create databases for different services
CREATE DATABASE xrules_api;
CREATE DATABASE xrules_engine;

-- Grant permissions
GRANT ALL PRIVILEGES ON DATABASE xrules_api TO xrules;
GRANT ALL PRIVILEGES ON DATABASE xrules_engine TO xrules;
