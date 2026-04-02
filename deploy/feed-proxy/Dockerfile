FROM nginx:1.28-alpine

COPY docker-entrypoint.sh /docker-entrypoint-local.sh
COPY default.conf.tmpl /etc/sub-store/default.conf.tmpl

RUN chmod +x /docker-entrypoint-local.sh

CMD ["/docker-entrypoint-local.sh"]
