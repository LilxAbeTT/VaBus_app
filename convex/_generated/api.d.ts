/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as admin from "../admin.js";
import type * as auth from "../auth.js";
import type * as data_importedRoutes from "../data/importedRoutes.js";
import type * as driver from "../driver.js";
import type * as http from "../http.js";
import type * as lib_activeServiceSnapshot from "../lib/activeServiceSnapshot.js";
import type * as lib_auth from "../lib/auth.js";
import type * as lib_driverLocationUpdates from "../lib/driverLocationUpdates.js";
import type * as lib_location from "../lib/location.js";
import type * as lib_routes from "../lib/routes.js";
import type * as lib_serviceOperationalState from "../lib/serviceOperationalState.js";
import type * as lib_services from "../lib/services.js";
import type * as lib_support from "../lib/support.js";
import type * as lib_systemEvents from "../lib/systemEvents.js";
import type * as passengerMap from "../passengerMap.js";
import type * as routes from "../routes.js";
import type * as seed from "../seed.js";
import type * as vehicles from "../vehicles.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  admin: typeof admin;
  auth: typeof auth;
  "data/importedRoutes": typeof data_importedRoutes;
  driver: typeof driver;
  http: typeof http;
  "lib/activeServiceSnapshot": typeof lib_activeServiceSnapshot;
  "lib/auth": typeof lib_auth;
  "lib/driverLocationUpdates": typeof lib_driverLocationUpdates;
  "lib/location": typeof lib_location;
  "lib/routes": typeof lib_routes;
  "lib/serviceOperationalState": typeof lib_serviceOperationalState;
  "lib/services": typeof lib_services;
  "lib/support": typeof lib_support;
  "lib/systemEvents": typeof lib_systemEvents;
  passengerMap: typeof passengerMap;
  routes: typeof routes;
  seed: typeof seed;
  vehicles: typeof vehicles;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
