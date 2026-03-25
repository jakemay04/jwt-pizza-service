const { request } = require('express');
const config = require('./config');

class Logger {
    log(level, type, data) {
        const sanatized = this.saranizeData(data);
        const labels = {
            componatent: config.logging.source,
            level: level,
            type: type,
        };
        const values = [[`${Date.now()}000000`, JSON.stringify({ level, type, ...sanatized})]];
        this.sendLogToGrafana({ streams: [{ stream: labels, values }] });

    }

    httpLogger(req, res, next) {
        const start = Date.now();
        const originalJson = res.json.bind(res);
        let responseBody;

        res.json = (body) => {
            responseBody = body;
            return originalJson(body);
        };

        res.on('finish', () => {
            const hasAuth = !!req.headers['authorization'];
            logger.log(res.statusCode >= 400 ? 'warn' : 'info', 'http', {
                method: req.method,
                path: req.path,
                statusCode: res.statusCode,
                hasAuth,
                requestBody: req.body,
                responseBody,
                duration: Date.now() - start,
            });
        });
        next();
    }
}