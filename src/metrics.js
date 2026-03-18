const config = require('./config');

// Metrics stored in memory
const httpMetrics = { total: 0, GET: 0, POST: 0, PUT: 0, DELETE: 0 };
const authMetrics = { success: 0, failure: 0 };
const pizzaOrderMetrics = { sold: 0, failed: 0, revenue: 0 };
const latencyMetrics = { service: 0, pizzaCreation: 0 };
let activeUsers = 0;

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

function pizzaOrderTracker(success, latency, revenue) {
  latencyMetrics.pizzaCreation = latency;
  if (success) {
    pizzaOrderMetrics.sold++;
    pizzaOrderMetrics.revenue += revenue;
    console.log('🍕 Pizza sold:', pizzaOrderMetrics);
  } else {
    pizzaOrderMetrics.failed++;
    console.log('❌ Pizza failed:', pizzaOrderMetrics);
  }
}

function incrementActiveUsers() { activeUsers++; console.log('👥 Active users:', activeUsers); }
function decrementActiveUsers() { if (activeUsers > 0) activeUsers--; }

// This will periodically send metrics to Grafana
setInterval(() => {
  const metrics = [];
  Object.keys(httpMetrics).forEach((method) => {
    metrics.push(createMetric('http_requests_total', httpMetrics[method], '1', 'sum', 'asInt', { method }));
  });

  metrics.push(createMetric('auth_attempts', authMetrics.success, '1', 'sum', 'asInt', { result: 'success' }));
  metrics.push(createMetric('auth_attempts', authMetrics.failure, '1', 'sum', 'asInt', { result: 'failure' }));

  metrics.push(createMetric('pizza_sold', pizzaOrderMetrics.sold, '1', 'sum', 'asInt', { result: 'success' }));
  metrics.push(createMetric('pizza_failed', pizzaOrderMetrics.failed, '1', 'sum', 'asInt', { result: 'failure' }));
  metrics.push(createMetric('pizza_revenue', pizzaOrderMetrics.revenue, 'USD', 'sum', 'asDouble', { result: 'success' }));

  metrics.push(createMetric('latency_service' , latencyMetrics.service, 'ms', 'gauge', 'asDouble', {}));
  metrics.push(createMetric('pizza_creation_latency', latencyMetrics.pizzaCreation, 'ms', 'gauge', 'asDouble', {}));

  metrics.push(createMetric('active_users', activeUsers, '1', 'gauge', 'asInt', {}));

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

module.exports = { requestTracker, authAttempt, pizzaOrderTracker, incrementActiveUsers, decrementActiveUsers };