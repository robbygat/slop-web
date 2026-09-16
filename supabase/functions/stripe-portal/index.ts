import { createBillingPortalHandler } from "../_shared/web_billing.mjs";
import { webBillingDependencies } from "../_shared/web_billing_runtime.ts";
Deno.serve(createBillingPortalHandler(webBillingDependencies));
