# Declare a build argument for the version
ARG VERSION

# Use OpenSearch image as base
FROM opensearchproject/opensearch-dashboards:${VERSION}

# Copy plugin zip into image
COPY ./build /tmp

USER root
RUN mv /tmp/investigationDashboards*.zip /tmp/investigationDashboards.zip
USER opensearch-dashboards

RUN /usr/share/opensearch-dashboards/bin/opensearch-dashboards-plugin remove investigationDashboards && \
      /usr/share/opensearch-dashboards/bin/opensearch-dashboards-plugin install file:///tmp/investigationDashboards.zip

USER root
RUN rm -r /tmp/investigationDashboards.zip

# Switch back to opensearch user
USER opensearch-dashboards
