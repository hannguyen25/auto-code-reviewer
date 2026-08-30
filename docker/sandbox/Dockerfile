FROM node:20-alpine

# Thiết lập thư mục làm việc trong /tmp/sandbox và cấp quyền cho user node (UID 1000)
WORKDIR /tmp/sandbox
RUN chown -R node:node /tmp/sandbox

# Chuyển sang user non-root có sẵn
USER node

CMD ["node", "-v"]