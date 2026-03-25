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
}