import type { D1Migration } from 'cloudflare:test';
import type { Bindings } from '../src/app';

declare global {
  namespace Cloudflare {
    interface Env extends Bindings {
      TEST_SCHEMA: D1Migration[];
    }
  }
}
