// Vercel serverless entry. Wraps the same handler server.js uses.
// Static files are served by Vercel's CDN from /public; everything else
// (routes, forms, find-your-room) runs through this function.

import { createApp } from '../src/app.js';

let appPromise = null;

function getApp() {
  if (!appPromise) {
    appPromise = createApp().then((app) => {
      if (app.store.enabled) app.store.refresh().catch(() => {});
      return app;
    });
  }
  return appPromise;
}

export default async function handler(req, res) {
  const app = await getApp();
  return app.handler(req, res);
}
