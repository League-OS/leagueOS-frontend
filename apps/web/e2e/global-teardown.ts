import { runLocalDbCleanup } from './local-db-cleanup';

export default async function globalTeardown() {
  runLocalDbCleanup();
}

