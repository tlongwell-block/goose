# Use a lightweight Nginx image
FROM nginx:stable-alpine

LABEL description="Serves the static files for the Goose simple web UI"

# Set working directory to the default Nginx serve directory
WORKDIR /usr/share/nginx/html

# Remove the default Nginx welcome page files
RUN rm -rf ./*

# Copy all the static UI files from the build context (the ui/web-simple directory)
# This includes index.html, style.css, main.js, app.js, api.js, ui.js
COPY *.js .
COPY *.html .
COPY *.css .

# Optional: Ensure files have correct permissions/ownership for the nginx user
# This might not be strictly necessary depending on base image config, but good practice
RUN chown -R nginx:nginx /usr/share/nginx/html && chmod -R 755 /usr/share/nginx/html

# Expose the default Nginx port
EXPOSE 80

# The base Nginx image already has a CMD to start the server, so we don't need to specify it.
# CMD ["nginx", "-g", "daemon off;"]

# Healthcheck (optional, but useful)
HEALTHCHECK --interval=5s --timeout=3s \
  CMD curl --fail http://localhost/ || exit 1
