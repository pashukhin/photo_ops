CREATE USER identity_user WITH PASSWORD 'identity_pass';
CREATE DATABASE identity_db OWNER identity_user;

CREATE USER photo_user WITH PASSWORD 'photo_pass';
CREATE DATABASE photo_db OWNER photo_user;

CREATE USER cluster_user WITH PASSWORD 'cluster_pass';
CREATE DATABASE cluster_db OWNER cluster_user;

CREATE USER publication_user WITH PASSWORD 'publication_pass';
CREATE DATABASE publication_db OWNER publication_user;

CREATE USER usage_user WITH PASSWORD 'usage_pass';
CREATE DATABASE usage_db OWNER usage_user;

CREATE USER connector_user WITH PASSWORD 'connector_pass';
CREATE DATABASE connector_db OWNER connector_user;
