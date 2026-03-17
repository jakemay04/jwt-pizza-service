const config = require('./config');

// Metrics stored in memory
const httpMetrics = { total: 0, GET: 0, POST: 0, PUT: 0, DELETE: 0 };
const authMetrics = { success: 0, failure: 0 };

// Middleware to track request
function requestTracker(req, res, next) {
  httpMetrics.total++;
  httpMetrics[req.method] = (httpMetrics[req.method] || 0) + 1;

  next();
}

function authAttempt(success) {
  if (success) {
    authMetrics.success++;
  } else {
    authMetrics.failure++;
  }
}

// This will periodically send metrics to Grafana
setInterval(() => {
  const metrics = [];
  Object.keys(httpMetrics).forEach((method) => {
    metrics.push(createMetric('http_requests_total', httpMetrics[method], '1', 'sum', 'asInt', { method }));
  });


  sendMetricToGrafana(metrics);
}, 10000);

//metric builder
function createMetric(metricName, metricValue, metricUnit, metricType, valueType, attributes) {
  attributes = { ...attributes, source: config.metrics.source };

  const metric = {
    name: metricName,
    unit: metricUnit,
    [metricType]: {
      dataPoints: [
        {
          [valueType]: metricValue,
          timeUnixNano: Date.now() * 1000000,
          attributes: [],
        },
      ],
    },
  };

  Object.keys(attributes).forEach((key) => {
    metric[metricType].dataPoints[0].attributes.push({
      key: key,
      value: { stringValue: attributes[key] },
    });
  });

  if (metricType === 'sum') {
    metric[metricType].aggregationTemporality = 'AGGREGATION_TEMPORALITY_CUMULATIVE';
    metric[metricType].isMonotonic = true;
  }

  return metric;
}

//format metrics and send to grafana
function sendMetricToGrafana(metrics) {
  const body = {
    resourceMetrics: [
      {
        scopeMetrics: [
          {
            metrics,
          },
        ],
      },
    ],
  };

  fetch(`${config.metrics.endpointUrl}`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { Authorization: `Bearer ${config.metrics.accountId}:${config.metrics.apiKey}`, 'Content-Type': 'application/json' },
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error(`HTTP status: ${response.status}`);
      }
    })
    .catch((error) => {
      console.error('Error pushing metrics:', error);
    });
}

module.exports = { requestTracker };