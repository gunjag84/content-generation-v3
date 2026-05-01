import { CloudTasksClient } from '@google-cloud/tasks';
import type { RenderTaskPayload } from '../../shared/schemas/renderJob.js';

const client = new CloudTasksClient();

const PROJECT_ID = process.env.GCLOUD_PROJECT ?? 'contentai-78bfb';
const LOCATION = 'europe-west1';
const QUEUE = 'render-queue';
const QUEUE_PATH = `projects/${PROJECT_ID}/locations/${LOCATION}/queues/${QUEUE}`;
const SERVICE_ACCOUNT_EMAIL = `internal-invoker@${PROJECT_ID}.iam.gserviceaccount.com`;

export async function enqueueRender(payload: RenderTaskPayload): Promise<void> {
  const serviceUrl = process.env.CLOUD_RUN_SERVICE_URL;
  if (!serviceUrl) throw new Error('CLOUD_RUN_SERVICE_URL env var is not set');

  const url = `${serviceUrl}/internal/render`;
  const body = Buffer.from(JSON.stringify(payload)).toString('base64');

  await client.createTask({
    parent: QUEUE_PATH,
    task: {
      httpRequest: {
        httpMethod: 'POST',
        url,
        headers: { 'Content-Type': 'application/json' },
        body,
        oidcToken: {
          serviceAccountEmail: SERVICE_ACCOUNT_EMAIL,
          audience: serviceUrl,
        },
      },
    },
  });
}
