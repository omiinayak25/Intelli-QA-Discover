/**
 * Small helpers over the Discovery Model.
 *
 * NOTE on the `roles` name: the common envelope carries `roles: string[]` (the
 * crawled role slugs) while Discovery-Model category 9 is `roles: RoleItem[]`.
 * Both are canonically named `roles`, so on the DiscoveryModel the category
 * array wins. Use `crawledRoles()` whenever the string slug list is needed.
 */

import type { DiscoveryModel } from "./types.js";

export function crawledRoles(model: DiscoveryModel): string[] {
  return model.roles.map((r) => r.name);
}
