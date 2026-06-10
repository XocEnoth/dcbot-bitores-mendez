import { readdir } from 'fs/promises';
import { join } from 'path';
import { pathToFileURL } from 'url';
import logger from '../utils/logger.js';

const EVENTS_DIR = join(import.meta.dirname, '..', 'events');

const loadEvents = async (client) => {
  let eventCount = 0;

  const categories = await readdir(EVENTS_DIR, { withFileTypes: true });
  const folders = categories.filter((entry) => entry.isDirectory());

  for (const folder of folders) {
    const folderPath = join(EVENTS_DIR, folder.name);
    const files = await readdir(folderPath);
    const eventFiles = files.filter((file) => file.endsWith('.js'));

    for (const file of eventFiles) {
      const filePath = join(folderPath, file);
      const fileUrl = pathToFileURL(filePath).href;
      const { default: event } = await import(fileUrl);

      if (!event.name || !event.execute) {
        logger.warn(`Skipping "${file}" — missing "name" or "execute" export`);
        continue;
      }

      if (event.once) {
        client.once(event.name, (...args) => event.execute(...args));
      } else {
        client.on(event.name, (...args) => event.execute(...args));
      }

      eventCount++;
    }
  }

  logger.info(`Registered ${eventCount} event(s) from ${folders.length} category(s)`);
};

export default loadEvents;
