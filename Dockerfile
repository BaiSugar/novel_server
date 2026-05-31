FROM oven/bun:1-slim

WORKDIR /app

# Prisma generate 需要数据库连接信息来解析配置（不会真的连接数据库）
ARG DATABASE_TYPE=mysql
ARG DATABASE_HOST=db
ARG DATABASE_PORT=3306
ARG DATABASE_NAME=novel
ARG DATABASE_USER=root
ARG DATABASE_PASSWORD=dummy
ENV DATABASE_TYPE=${DATABASE_TYPE}
ENV DATABASE_HOST=${DATABASE_HOST}
ENV DATABASE_PORT=${DATABASE_PORT}
ENV DATABASE_NAME=${DATABASE_NAME}
ENV DATABASE_USER=${DATABASE_USER}
ENV DATABASE_PASSWORD=${DATABASE_PASSWORD}

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# 复制运行和代码生成所需文件，确保镜像脱离 volume 也能启动。
COPY prisma ./prisma
COPY prisma.config.ts ./
COPY tsconfig.json ./
COPY support ./support
COPY app ./app
COPY public ./public

RUN bun run prisma_generate
RUN bun run generate_script

ENV NODE_ENV=production

EXPOSE 4000

ENTRYPOINT ["/bin/sh", "-lc"]
CMD ["bun run start"]