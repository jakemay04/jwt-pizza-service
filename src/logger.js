const config = require('./config');

class Logger {
    log(level, type, data) {
        const sanitized = this.sanitize(data);
        const event = {
            streams: [
            {
                stream: {
                component: config.logging.source,
                type: type,
                },
                values: [
                [`${Date.now()}000000`, JSON.stringify({ level, type, ...sanitized })]
                ],
            },
            ],
        };
        this.sendLogToGrafana(event);

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

    dbLogger(sql) {
        this.log('info', 'db', { sql });
    }

    factoryLogger(direction, data) {
        this.log('info', 'factory', { direction, data });
    }

    exceptionLogger(err) {
        this.log('error', 'exception', { message: err.message, stack: err.stack });
    }

    sanitize(data) {
        const raw = JSON.stringify(data);
        const cleaned = raw
            .replace(/"password"\s*:\s*"[^"]*"/g, '"password":"***"')
            .replace(/password='[^']*'/g, "password='***'")
            .replace(/"token"\s*:\s*"[^"]*"/g, '"token":"***"')
            .replace(/"apiKey"\s*:\s*"[^"]*"/g, '"apiKey":"***"');

       try {
        return JSON.parse(cleaned);
       } catch {
        return { raw: cleaned };
       }
    }

    sendLogToGrafana(event) {
        const body = JSON.stringify(event);
        fetch(config.logging.endpointUrl, {
            method: 'POST',
            body,
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${config.logging.accountId}:${config.logging.apiKey}`
            },
        }).then(res => {
            if (!res.ok) {
                res.text().then((t) => 
                    console.error('Failed to send log to Grafana:', t));
            }
        }).catch((err) => console.error('Logger fetch error:', err));
    }
}

const logger = new Logger();
module.exports = new Logger();