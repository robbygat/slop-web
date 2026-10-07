# Slop project boundary

The owner requires strict isolation from **Parky and all work Cloudflare resources**. Never modify, deploy, bind, rename or delete resources in Parky/work accounts. A Slop worker name is not proof of account ownership.

Cloudflare deployment is currently disabled by a nonexistent account pin and a local build guard. Do not remove or override these guards, use a global/default Cloudflare account, or use temporary-account deployment as a workaround. A future Slop Cloudflare deployment requires fresh read-only verification that the owner-approved personal account owns `slop.game`, an exact account pin, and a token restricted to that account. Keep the guard until that review is explicitly approved.

The production Slop Supabase project is `yqlolbebqfsodqgjlbeh` (`slop.game`). Any approved production database action must explicitly target that ref and independently verify its identity. Never run a blanket `supabase db push`.
