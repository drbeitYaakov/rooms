"use strict";
/*
 * ATTENTION: An "eval-source-map" devtool has been used.
 * This devtool is neither made for production nor for readable output files.
 * It uses "eval()" calls to create a separate source file with attached SourceMaps in the browser devtools.
 * If you are trying to read the output file, select a different devtool (https://webpack.js.org/configuration/devtool/)
 * or disable the default devtool with "devtool: false".
 * If you are looking for production-ready output files, see mode: "production" (https://webpack.js.org/configuration/mode/).
 */
(() => {
var exports = {};
exports.id = "app/api/auth/bridge-token/route";
exports.ids = ["app/api/auth/bridge-token/route"];
exports.modules = {

/***/ "next/dist/compiled/next-server/app-route.runtime.dev.js":
/*!**************************************************************************!*\
  !*** external "next/dist/compiled/next-server/app-route.runtime.dev.js" ***!
  \**************************************************************************/
/***/ ((module) => {

module.exports = require("next/dist/compiled/next-server/app-route.runtime.dev.js");

/***/ }),

/***/ "./action-async-storage.external?8652":
/*!**********************************************************************************!*\
  !*** external "next/dist\\client\\components\\action-async-storage.external.js" ***!
  \**********************************************************************************/
/***/ ((module) => {

module.exports = require("next/dist\\client\\components\\action-async-storage.external.js");

/***/ }),

/***/ "./request-async-storage.external?0211":
/*!***********************************************************************************!*\
  !*** external "next/dist\\client\\components\\request-async-storage.external.js" ***!
  \***********************************************************************************/
/***/ ((module) => {

module.exports = require("next/dist\\client\\components\\request-async-storage.external.js");

/***/ }),

/***/ "./static-generation-async-storage.external?137c":
/*!*********************************************************************************************!*\
  !*** external "next/dist\\client\\components\\static-generation-async-storage.external.js" ***!
  \*********************************************************************************************/
/***/ ((module) => {

module.exports = require("next/dist\\client\\components\\static-generation-async-storage.external.js");

/***/ }),

/***/ "assert":
/*!*************************!*\
  !*** external "assert" ***!
  \*************************/
/***/ ((module) => {

module.exports = require("assert");

/***/ }),

/***/ "buffer":
/*!*************************!*\
  !*** external "buffer" ***!
  \*************************/
/***/ ((module) => {

module.exports = require("buffer");

/***/ }),

/***/ "crypto":
/*!*************************!*\
  !*** external "crypto" ***!
  \*************************/
/***/ ((module) => {

module.exports = require("crypto");

/***/ }),

/***/ "events":
/*!*************************!*\
  !*** external "events" ***!
  \*************************/
/***/ ((module) => {

module.exports = require("events");

/***/ }),

/***/ "http":
/*!***********************!*\
  !*** external "http" ***!
  \***********************/
/***/ ((module) => {

module.exports = require("http");

/***/ }),

/***/ "https":
/*!************************!*\
  !*** external "https" ***!
  \************************/
/***/ ((module) => {

module.exports = require("https");

/***/ }),

/***/ "querystring":
/*!******************************!*\
  !*** external "querystring" ***!
  \******************************/
/***/ ((module) => {

module.exports = require("querystring");

/***/ }),

/***/ "url":
/*!**********************!*\
  !*** external "url" ***!
  \**********************/
/***/ ((module) => {

module.exports = require("url");

/***/ }),

/***/ "util":
/*!***********************!*\
  !*** external "util" ***!
  \***********************/
/***/ ((module) => {

module.exports = require("util");

/***/ }),

/***/ "zlib":
/*!***********************!*\
  !*** external "zlib" ***!
  \***********************/
/***/ ((module) => {

module.exports = require("zlib");

/***/ }),

/***/ "(rsc)/./node_modules/next/dist/build/webpack/loaders/next-app-loader.js?name=app%2Fapi%2Fauth%2Fbridge-token%2Froute&page=%2Fapi%2Fauth%2Fbridge-token%2Froute&appPaths=&pagePath=private-next-app-dir%2Fapi%2Fauth%2Fbridge-token%2Froute.ts&appDir=D%3A%5C%D7%A2%D7%91%D7%95%D7%93%D7%94%5C%D7%A1%D7%9E%D7%99%D7%A0%D7%A8%5C%D7%A4%D7%A8%D7%95%D7%99%D7%99%D7%A7%D7%98%20%D7%9B%D7%99%D7%AA%D7%95%D7%AA%20%D7%97%D7%93%D7%A9%5Csrc%5Cfrontend%5Csrc%5Capp&pageExtensions=tsx&pageExtensions=ts&pageExtensions=jsx&pageExtensions=js&rootDir=D%3A%5C%D7%A2%D7%91%D7%95%D7%93%D7%94%5C%D7%A1%D7%9E%D7%99%D7%A0%D7%A8%5C%D7%A4%D7%A8%D7%95%D7%99%D7%99%D7%A7%D7%98%20%D7%9B%D7%99%D7%AA%D7%95%D7%AA%20%D7%97%D7%93%D7%A9%5Csrc%5Cfrontend&isDev=true&tsconfigPath=tsconfig.json&basePath=&assetPrefix=&nextConfigOutput=&preferredRegion=&middlewareConfig=e30%3D!":
/*!*******************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************!*\
  !*** ./node_modules/next/dist/build/webpack/loaders/next-app-loader.js?name=app%2Fapi%2Fauth%2Fbridge-token%2Froute&page=%2Fapi%2Fauth%2Fbridge-token%2Froute&appPaths=&pagePath=private-next-app-dir%2Fapi%2Fauth%2Fbridge-token%2Froute.ts&appDir=D%3A%5C%D7%A2%D7%91%D7%95%D7%93%D7%94%5C%D7%A1%D7%9E%D7%99%D7%A0%D7%A8%5C%D7%A4%D7%A8%D7%95%D7%99%D7%99%D7%A7%D7%98%20%D7%9B%D7%99%D7%AA%D7%95%D7%AA%20%D7%97%D7%93%D7%A9%5Csrc%5Cfrontend%5Csrc%5Capp&pageExtensions=tsx&pageExtensions=ts&pageExtensions=jsx&pageExtensions=js&rootDir=D%3A%5C%D7%A2%D7%91%D7%95%D7%93%D7%94%5C%D7%A1%D7%9E%D7%99%D7%A0%D7%A8%5C%D7%A4%D7%A8%D7%95%D7%99%D7%99%D7%A7%D7%98%20%D7%9B%D7%99%D7%AA%D7%95%D7%AA%20%D7%97%D7%93%D7%A9%5Csrc%5Cfrontend&isDev=true&tsconfigPath=tsconfig.json&basePath=&assetPrefix=&nextConfigOutput=&preferredRegion=&middlewareConfig=e30%3D! ***!
  \*******************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   headerHooks: () => (/* binding */ headerHooks),\n/* harmony export */   originalPathname: () => (/* binding */ originalPathname),\n/* harmony export */   patchFetch: () => (/* binding */ patchFetch),\n/* harmony export */   requestAsyncStorage: () => (/* binding */ requestAsyncStorage),\n/* harmony export */   routeModule: () => (/* binding */ routeModule),\n/* harmony export */   serverHooks: () => (/* binding */ serverHooks),\n/* harmony export */   staticGenerationAsyncStorage: () => (/* binding */ staticGenerationAsyncStorage),\n/* harmony export */   staticGenerationBailout: () => (/* binding */ staticGenerationBailout)\n/* harmony export */ });\n/* harmony import */ var next_dist_server_future_route_modules_app_route_module_compiled__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! next/dist/server/future/route-modules/app-route/module.compiled */ \"(rsc)/./node_modules/next/dist/server/future/route-modules/app-route/module.compiled.js\");\n/* harmony import */ var next_dist_server_future_route_modules_app_route_module_compiled__WEBPACK_IMPORTED_MODULE_0___default = /*#__PURE__*/__webpack_require__.n(next_dist_server_future_route_modules_app_route_module_compiled__WEBPACK_IMPORTED_MODULE_0__);\n/* harmony import */ var next_dist_server_future_route_kind__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! next/dist/server/future/route-kind */ \"(rsc)/./node_modules/next/dist/server/future/route-kind.js\");\n/* harmony import */ var next_dist_server_lib_patch_fetch__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! next/dist/server/lib/patch-fetch */ \"(rsc)/./node_modules/next/dist/server/lib/patch-fetch.js\");\n/* harmony import */ var next_dist_server_lib_patch_fetch__WEBPACK_IMPORTED_MODULE_2___default = /*#__PURE__*/__webpack_require__.n(next_dist_server_lib_patch_fetch__WEBPACK_IMPORTED_MODULE_2__);\n/* harmony import */ var D_src_frontend_src_app_api_auth_bridge_token_route_ts__WEBPACK_IMPORTED_MODULE_3__ = __webpack_require__(/*! ./src/app/api/auth/bridge-token/route.ts */ \"(rsc)/./src/app/api/auth/bridge-token/route.ts\");\n\n\n\n\n// We inject the nextConfigOutput here so that we can use them in the route\n// module.\nconst nextConfigOutput = \"\"\nconst routeModule = new next_dist_server_future_route_modules_app_route_module_compiled__WEBPACK_IMPORTED_MODULE_0__.AppRouteRouteModule({\n    definition: {\n        kind: next_dist_server_future_route_kind__WEBPACK_IMPORTED_MODULE_1__.RouteKind.APP_ROUTE,\n        page: \"/api/auth/bridge-token/route\",\n        pathname: \"/api/auth/bridge-token\",\n        filename: \"route\",\n        bundlePath: \"app/api/auth/bridge-token/route\"\n    },\n    resolvedPagePath: \"D:\\\\עבודה\\\\סמינר\\\\פרוייקט כיתות חדש\\\\src\\\\frontend\\\\src\\\\app\\\\api\\\\auth\\\\bridge-token\\\\route.ts\",\n    nextConfigOutput,\n    userland: D_src_frontend_src_app_api_auth_bridge_token_route_ts__WEBPACK_IMPORTED_MODULE_3__\n});\n// Pull out the exports that we need to expose from the module. This should\n// be eliminated when we've moved the other routes to the new format. These\n// are used to hook into the route.\nconst { requestAsyncStorage, staticGenerationAsyncStorage, serverHooks, headerHooks, staticGenerationBailout } = routeModule;\nconst originalPathname = \"/api/auth/bridge-token/route\";\nfunction patchFetch() {\n    return (0,next_dist_server_lib_patch_fetch__WEBPACK_IMPORTED_MODULE_2__.patchFetch)({\n        serverHooks,\n        staticGenerationAsyncStorage\n    });\n}\n\n\n//# sourceMappingURL=app-route.js.map//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHJzYykvLi9ub2RlX21vZHVsZXMvbmV4dC9kaXN0L2J1aWxkL3dlYnBhY2svbG9hZGVycy9uZXh0LWFwcC1sb2FkZXIuanM/bmFtZT1hcHAlMkZhcGklMkZhdXRoJTJGYnJpZGdlLXRva2VuJTJGcm91dGUmcGFnZT0lMkZhcGklMkZhdXRoJTJGYnJpZGdlLXRva2VuJTJGcm91dGUmYXBwUGF0aHM9JnBhZ2VQYXRoPXByaXZhdGUtbmV4dC1hcHAtZGlyJTJGYXBpJTJGYXV0aCUyRmJyaWRnZS10b2tlbiUyRnJvdXRlLnRzJmFwcERpcj1EJTNBJTVDJUQ3JUEyJUQ3JTkxJUQ3JTk1JUQ3JTkzJUQ3JTk0JTVDJUQ3JUExJUQ3JTlFJUQ3JTk5JUQ3JUEwJUQ3JUE4JTVDJUQ3JUE0JUQ3JUE4JUQ3JTk1JUQ3JTk5JUQ3JTk5JUQ3JUE3JUQ3JTk4JTIwJUQ3JTlCJUQ3JTk5JUQ3JUFBJUQ3JTk1JUQ3JUFBJTIwJUQ3JTk3JUQ3JTkzJUQ3JUE5JTVDc3JjJTVDZnJvbnRlbmQlNUNzcmMlNUNhcHAmcGFnZUV4dGVuc2lvbnM9dHN4JnBhZ2VFeHRlbnNpb25zPXRzJnBhZ2VFeHRlbnNpb25zPWpzeCZwYWdlRXh0ZW5zaW9ucz1qcyZyb290RGlyPUQlM0ElNUMlRDclQTIlRDclOTElRDclOTUlRDclOTMlRDclOTQlNUMlRDclQTElRDclOUUlRDclOTklRDclQTAlRDclQTglNUMlRDclQTQlRDclQTglRDclOTUlRDclOTklRDclOTklRDclQTclRDclOTglMjAlRDclOUIlRDclOTklRDclQUElRDclOTUlRDclQUElMjAlRDclOTclRDclOTMlRDclQTklNUNzcmMlNUNmcm9udGVuZCZpc0Rldj10cnVlJnRzY29uZmlnUGF0aD10c2NvbmZpZy5qc29uJmJhc2VQYXRoPSZhc3NldFByZWZpeD0mbmV4dENvbmZpZ091dHB1dD0mcHJlZmVycmVkUmVnaW9uPSZtaWRkbGV3YXJlQ29uZmlnPWUzMCUzRCEiLCJtYXBwaW5ncyI6Ijs7Ozs7Ozs7Ozs7Ozs7Ozs7QUFBc0c7QUFDdkM7QUFDYztBQUMrQztBQUM1SDtBQUNBO0FBQ0E7QUFDQSx3QkFBd0IsZ0hBQW1CO0FBQzNDO0FBQ0EsY0FBYyx5RUFBUztBQUN2QjtBQUNBO0FBQ0E7QUFDQTtBQUNBLEtBQUs7QUFDTDtBQUNBO0FBQ0EsWUFBWTtBQUNaLENBQUM7QUFDRDtBQUNBO0FBQ0E7QUFDQSxRQUFRLHVHQUF1RztBQUMvRztBQUNBO0FBQ0EsV0FBVyw0RUFBVztBQUN0QjtBQUNBO0FBQ0EsS0FBSztBQUNMO0FBQzZKOztBQUU3SiIsInNvdXJjZXMiOlsid2VicGFjazovL2VkdWNhdGlvbmFsLXNjaGVkdWxpbmctZnJvbnRlbmQvP2UyMDEiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgQXBwUm91dGVSb3V0ZU1vZHVsZSB9IGZyb20gXCJuZXh0L2Rpc3Qvc2VydmVyL2Z1dHVyZS9yb3V0ZS1tb2R1bGVzL2FwcC1yb3V0ZS9tb2R1bGUuY29tcGlsZWRcIjtcbmltcG9ydCB7IFJvdXRlS2luZCB9IGZyb20gXCJuZXh0L2Rpc3Qvc2VydmVyL2Z1dHVyZS9yb3V0ZS1raW5kXCI7XG5pbXBvcnQgeyBwYXRjaEZldGNoIGFzIF9wYXRjaEZldGNoIH0gZnJvbSBcIm5leHQvZGlzdC9zZXJ2ZXIvbGliL3BhdGNoLWZldGNoXCI7XG5pbXBvcnQgKiBhcyB1c2VybGFuZCBmcm9tIFwiRDpcXFxc16LXkdeV15PXlFxcXFzXodee15nXoNeoXFxcXNek16jXldeZ15nXp9eYINeb15nXqteV16og15fXk9epXFxcXHNyY1xcXFxmcm9udGVuZFxcXFxzcmNcXFxcYXBwXFxcXGFwaVxcXFxhdXRoXFxcXGJyaWRnZS10b2tlblxcXFxyb3V0ZS50c1wiO1xuLy8gV2UgaW5qZWN0IHRoZSBuZXh0Q29uZmlnT3V0cHV0IGhlcmUgc28gdGhhdCB3ZSBjYW4gdXNlIHRoZW0gaW4gdGhlIHJvdXRlXG4vLyBtb2R1bGUuXG5jb25zdCBuZXh0Q29uZmlnT3V0cHV0ID0gXCJcIlxuY29uc3Qgcm91dGVNb2R1bGUgPSBuZXcgQXBwUm91dGVSb3V0ZU1vZHVsZSh7XG4gICAgZGVmaW5pdGlvbjoge1xuICAgICAgICBraW5kOiBSb3V0ZUtpbmQuQVBQX1JPVVRFLFxuICAgICAgICBwYWdlOiBcIi9hcGkvYXV0aC9icmlkZ2UtdG9rZW4vcm91dGVcIixcbiAgICAgICAgcGF0aG5hbWU6IFwiL2FwaS9hdXRoL2JyaWRnZS10b2tlblwiLFxuICAgICAgICBmaWxlbmFtZTogXCJyb3V0ZVwiLFxuICAgICAgICBidW5kbGVQYXRoOiBcImFwcC9hcGkvYXV0aC9icmlkZ2UtdG9rZW4vcm91dGVcIlxuICAgIH0sXG4gICAgcmVzb2x2ZWRQYWdlUGF0aDogXCJEOlxcXFzXoteR15XXk9eUXFxcXNeh157Xmdeg16hcXFxc16TXqNeV15nXmden15gg15vXmdeq15XXqiDXl9eT16lcXFxcc3JjXFxcXGZyb250ZW5kXFxcXHNyY1xcXFxhcHBcXFxcYXBpXFxcXGF1dGhcXFxcYnJpZGdlLXRva2VuXFxcXHJvdXRlLnRzXCIsXG4gICAgbmV4dENvbmZpZ091dHB1dCxcbiAgICB1c2VybGFuZFxufSk7XG4vLyBQdWxsIG91dCB0aGUgZXhwb3J0cyB0aGF0IHdlIG5lZWQgdG8gZXhwb3NlIGZyb20gdGhlIG1vZHVsZS4gVGhpcyBzaG91bGRcbi8vIGJlIGVsaW1pbmF0ZWQgd2hlbiB3ZSd2ZSBtb3ZlZCB0aGUgb3RoZXIgcm91dGVzIHRvIHRoZSBuZXcgZm9ybWF0LiBUaGVzZVxuLy8gYXJlIHVzZWQgdG8gaG9vayBpbnRvIHRoZSByb3V0ZS5cbmNvbnN0IHsgcmVxdWVzdEFzeW5jU3RvcmFnZSwgc3RhdGljR2VuZXJhdGlvbkFzeW5jU3RvcmFnZSwgc2VydmVySG9va3MsIGhlYWRlckhvb2tzLCBzdGF0aWNHZW5lcmF0aW9uQmFpbG91dCB9ID0gcm91dGVNb2R1bGU7XG5jb25zdCBvcmlnaW5hbFBhdGhuYW1lID0gXCIvYXBpL2F1dGgvYnJpZGdlLXRva2VuL3JvdXRlXCI7XG5mdW5jdGlvbiBwYXRjaEZldGNoKCkge1xuICAgIHJldHVybiBfcGF0Y2hGZXRjaCh7XG4gICAgICAgIHNlcnZlckhvb2tzLFxuICAgICAgICBzdGF0aWNHZW5lcmF0aW9uQXN5bmNTdG9yYWdlXG4gICAgfSk7XG59XG5leHBvcnQgeyByb3V0ZU1vZHVsZSwgcmVxdWVzdEFzeW5jU3RvcmFnZSwgc3RhdGljR2VuZXJhdGlvbkFzeW5jU3RvcmFnZSwgc2VydmVySG9va3MsIGhlYWRlckhvb2tzLCBzdGF0aWNHZW5lcmF0aW9uQmFpbG91dCwgb3JpZ2luYWxQYXRobmFtZSwgcGF0Y2hGZXRjaCwgIH07XG5cbi8vIyBzb3VyY2VNYXBwaW5nVVJMPWFwcC1yb3V0ZS5qcy5tYXAiXSwibmFtZXMiOltdLCJzb3VyY2VSb290IjoiIn0=\n//# sourceURL=webpack-internal:///(rsc)/./node_modules/next/dist/build/webpack/loaders/next-app-loader.js?name=app%2Fapi%2Fauth%2Fbridge-token%2Froute&page=%2Fapi%2Fauth%2Fbridge-token%2Froute&appPaths=&pagePath=private-next-app-dir%2Fapi%2Fauth%2Fbridge-token%2Froute.ts&appDir=D%3A%5C%D7%A2%D7%91%D7%95%D7%93%D7%94%5C%D7%A1%D7%9E%D7%99%D7%A0%D7%A8%5C%D7%A4%D7%A8%D7%95%D7%99%D7%99%D7%A7%D7%98%20%D7%9B%D7%99%D7%AA%D7%95%D7%AA%20%D7%97%D7%93%D7%A9%5Csrc%5Cfrontend%5Csrc%5Capp&pageExtensions=tsx&pageExtensions=ts&pageExtensions=jsx&pageExtensions=js&rootDir=D%3A%5C%D7%A2%D7%91%D7%95%D7%93%D7%94%5C%D7%A1%D7%9E%D7%99%D7%A0%D7%A8%5C%D7%A4%D7%A8%D7%95%D7%99%D7%99%D7%A7%D7%98%20%D7%9B%D7%99%D7%AA%D7%95%D7%AA%20%D7%97%D7%93%D7%A9%5Csrc%5Cfrontend&isDev=true&tsconfigPath=tsconfig.json&basePath=&assetPrefix=&nextConfigOutput=&preferredRegion=&middlewareConfig=e30%3D!\n");

/***/ }),

/***/ "(rsc)/./src/app/api/auth/bridge-token/route.ts":
/*!************************************************!*\
  !*** ./src/app/api/auth/bridge-token/route.ts ***!
  \************************************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   POST: () => (/* binding */ POST),\n/* harmony export */   dynamic: () => (/* binding */ dynamic)\n/* harmony export */ });\n/* harmony import */ var next_dist_server_web_exports_next_response__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! next/dist/server/web/exports/next-response */ \"(rsc)/./node_modules/next/dist/server/web/exports/next-response.js\");\n/* harmony import */ var next_auth__WEBPACK_IMPORTED_MODULE_1__ = __webpack_require__(/*! next-auth */ \"(rsc)/./node_modules/next-auth/index.js\");\n/* harmony import */ var next_auth__WEBPACK_IMPORTED_MODULE_1___default = /*#__PURE__*/__webpack_require__.n(next_auth__WEBPACK_IMPORTED_MODULE_1__);\n/* harmony import */ var _lib_auth__WEBPACK_IMPORTED_MODULE_2__ = __webpack_require__(/*! @/lib/auth */ \"(rsc)/./src/lib/auth.ts\");\n\n\n\nconst dynamic = \"force-dynamic\";\nasync function POST() {\n    try {\n        const session = await (0,next_auth__WEBPACK_IMPORTED_MODULE_1__.getServerSession)(_lib_auth__WEBPACK_IMPORTED_MODULE_2__.authOptions);\n        if (!session?.user?.id || !session.user.email || !session.user.role) {\n            return next_dist_server_web_exports_next_response__WEBPACK_IMPORTED_MODULE_0__[\"default\"].json({\n                success: false,\n                error: \"Authentication required\"\n            }, {\n                status: 401\n            });\n        }\n        const sharedSecret = process.env.BRIDGE_TOKEN_SHARED_SECRET || process.env.NEXTAUTH_SECRET;\n        if (!sharedSecret) {\n            return next_dist_server_web_exports_next_response__WEBPACK_IMPORTED_MODULE_0__[\"default\"].json({\n                success: false,\n                error: \"Bridge token integration is not configured\"\n            }, {\n                status: 500\n            });\n        }\n        const response = await fetch(`${\"http://localhost:3001\" || 0}/api/auth/bridge-token`, {\n            method: \"POST\",\n            headers: {\n                \"Content-Type\": \"application/json\",\n                \"X-Bridge-Token-Secret\": sharedSecret\n            },\n            body: JSON.stringify({\n                id: session.user.id,\n                email: session.user.email,\n                role: session.user.role\n            })\n        });\n        if (!response.ok) {\n            const errorData = await response.json();\n            return next_dist_server_web_exports_next_response__WEBPACK_IMPORTED_MODULE_0__[\"default\"].json({\n                success: false,\n                error: errorData.error || \"Failed to create bridge token\"\n            }, {\n                status: response.status\n            });\n        }\n        const data = await response.json();\n        return next_dist_server_web_exports_next_response__WEBPACK_IMPORTED_MODULE_0__[\"default\"].json(data);\n    } catch (error) {\n        console.error(\"Bridge token error:\", error);\n        return next_dist_server_web_exports_next_response__WEBPACK_IMPORTED_MODULE_0__[\"default\"].json({\n            success: false,\n            error: \"Internal server error\"\n        }, {\n            status: 500\n        });\n    }\n}\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHJzYykvLi9zcmMvYXBwL2FwaS9hdXRoL2JyaWRnZS10b2tlbi9yb3V0ZS50cyIsIm1hcHBpbmdzIjoiOzs7Ozs7Ozs7QUFBMkM7QUFDRTtBQUNKO0FBRWxDLE1BQU1HLFVBQVUsZ0JBQWdCO0FBRWhDLGVBQWVDO0lBQ3BCLElBQUk7UUFDRixNQUFNQyxVQUFVLE1BQU1KLDJEQUFnQkEsQ0FBQ0Msa0RBQVdBO1FBRWxELElBQUksQ0FBQ0csU0FBU0MsTUFBTUMsTUFBTSxDQUFDRixRQUFRQyxJQUFJLENBQUNFLEtBQUssSUFBSSxDQUFDSCxRQUFRQyxJQUFJLENBQUNHLElBQUksRUFBRTtZQUNuRSxPQUFPVCxrRkFBWUEsQ0FBQ1UsSUFBSSxDQUN0QjtnQkFBRUMsU0FBUztnQkFBT0MsT0FBTztZQUEwQixHQUNuRDtnQkFBRUMsUUFBUTtZQUFJO1FBRWxCO1FBRUEsTUFBTUMsZUFBZUMsUUFBUUMsR0FBRyxDQUFDQywwQkFBMEIsSUFBSUYsUUFBUUMsR0FBRyxDQUFDRSxlQUFlO1FBQzFGLElBQUksQ0FBQ0osY0FBYztZQUNqQixPQUFPZCxrRkFBWUEsQ0FBQ1UsSUFBSSxDQUN0QjtnQkFBRUMsU0FBUztnQkFBT0MsT0FBTztZQUE2QyxHQUN0RTtnQkFBRUMsUUFBUTtZQUFJO1FBRWxCO1FBRUEsTUFBTU0sV0FBVyxNQUFNQyxNQUFNLENBQUMsRUFBRUwsdUJBQStCLElBQUksRUFBd0Isc0JBQXNCLENBQUMsRUFBRTtZQUNsSE8sUUFBUTtZQUNSQyxTQUFTO2dCQUNQLGdCQUFnQjtnQkFDaEIseUJBQXlCVDtZQUMzQjtZQUNBVSxNQUFNQyxLQUFLQyxTQUFTLENBQUM7Z0JBQ25CbkIsSUFBSUYsUUFBUUMsSUFBSSxDQUFDQyxFQUFFO2dCQUNuQkMsT0FBT0gsUUFBUUMsSUFBSSxDQUFDRSxLQUFLO2dCQUN6QkMsTUFBTUosUUFBUUMsSUFBSSxDQUFDRyxJQUFJO1lBQ3pCO1FBQ0Y7UUFFQSxJQUFJLENBQUNVLFNBQVNRLEVBQUUsRUFBRTtZQUNoQixNQUFNQyxZQUFZLE1BQU1ULFNBQVNULElBQUk7WUFDckMsT0FBT1Ysa0ZBQVlBLENBQUNVLElBQUksQ0FDdEI7Z0JBQUVDLFNBQVM7Z0JBQU9DLE9BQU9nQixVQUFVaEIsS0FBSyxJQUFJO1lBQWdDLEdBQzVFO2dCQUFFQyxRQUFRTSxTQUFTTixNQUFNO1lBQUM7UUFFOUI7UUFFQSxNQUFNZ0IsT0FBTyxNQUFNVixTQUFTVCxJQUFJO1FBQ2hDLE9BQU9WLGtGQUFZQSxDQUFDVSxJQUFJLENBQUNtQjtJQUUzQixFQUFFLE9BQU9qQixPQUFPO1FBQ2RrQixRQUFRbEIsS0FBSyxDQUFDLHVCQUF1QkE7UUFDckMsT0FBT1osa0ZBQVlBLENBQUNVLElBQUksQ0FDdEI7WUFBRUMsU0FBUztZQUFPQyxPQUFPO1FBQXdCLEdBQ2pEO1lBQUVDLFFBQVE7UUFBSTtJQUVsQjtBQUNGIiwic291cmNlcyI6WyJ3ZWJwYWNrOi8vZWR1Y2F0aW9uYWwtc2NoZWR1bGluZy1mcm9udGVuZC8uL3NyYy9hcHAvYXBpL2F1dGgvYnJpZGdlLXRva2VuL3JvdXRlLnRzPzM0MGQiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0IHsgTmV4dFJlc3BvbnNlIH0gZnJvbSAnbmV4dC9zZXJ2ZXInO1xuaW1wb3J0IHsgZ2V0U2VydmVyU2Vzc2lvbiB9IGZyb20gJ25leHQtYXV0aCc7XG5pbXBvcnQgeyBhdXRoT3B0aW9ucyB9IGZyb20gJ0AvbGliL2F1dGgnO1xuXG5leHBvcnQgY29uc3QgZHluYW1pYyA9ICdmb3JjZS1keW5hbWljJztcblxuZXhwb3J0IGFzeW5jIGZ1bmN0aW9uIFBPU1QoKSB7XG4gIHRyeSB7XG4gICAgY29uc3Qgc2Vzc2lvbiA9IGF3YWl0IGdldFNlcnZlclNlc3Npb24oYXV0aE9wdGlvbnMpO1xuXG4gICAgaWYgKCFzZXNzaW9uPy51c2VyPy5pZCB8fCAhc2Vzc2lvbi51c2VyLmVtYWlsIHx8ICFzZXNzaW9uLnVzZXIucm9sZSkge1xuICAgICAgcmV0dXJuIE5leHRSZXNwb25zZS5qc29uKFxuICAgICAgICB7IHN1Y2Nlc3M6IGZhbHNlLCBlcnJvcjogJ0F1dGhlbnRpY2F0aW9uIHJlcXVpcmVkJyB9LFxuICAgICAgICB7IHN0YXR1czogNDAxIH1cbiAgICAgICk7XG4gICAgfVxuXG4gICAgY29uc3Qgc2hhcmVkU2VjcmV0ID0gcHJvY2Vzcy5lbnYuQlJJREdFX1RPS0VOX1NIQVJFRF9TRUNSRVQgfHwgcHJvY2Vzcy5lbnYuTkVYVEFVVEhfU0VDUkVUO1xuICAgIGlmICghc2hhcmVkU2VjcmV0KSB7XG4gICAgICByZXR1cm4gTmV4dFJlc3BvbnNlLmpzb24oXG4gICAgICAgIHsgc3VjY2VzczogZmFsc2UsIGVycm9yOiAnQnJpZGdlIHRva2VuIGludGVncmF0aW9uIGlzIG5vdCBjb25maWd1cmVkJyB9LFxuICAgICAgICB7IHN0YXR1czogNTAwIH1cbiAgICAgICk7XG4gICAgfVxuXG4gICAgY29uc3QgcmVzcG9uc2UgPSBhd2FpdCBmZXRjaChgJHtwcm9jZXNzLmVudi5ORVhUX1BVQkxJQ19BUElfVVJMIHx8ICdodHRwOi8vbG9jYWxob3N0OjMwMDEnfS9hcGkvYXV0aC9icmlkZ2UtdG9rZW5gLCB7XG4gICAgICBtZXRob2Q6ICdQT1NUJyxcbiAgICAgIGhlYWRlcnM6IHtcbiAgICAgICAgJ0NvbnRlbnQtVHlwZSc6ICdhcHBsaWNhdGlvbi9qc29uJyxcbiAgICAgICAgJ1gtQnJpZGdlLVRva2VuLVNlY3JldCc6IHNoYXJlZFNlY3JldCxcbiAgICAgIH0sXG4gICAgICBib2R5OiBKU09OLnN0cmluZ2lmeSh7XG4gICAgICAgIGlkOiBzZXNzaW9uLnVzZXIuaWQsXG4gICAgICAgIGVtYWlsOiBzZXNzaW9uLnVzZXIuZW1haWwsXG4gICAgICAgIHJvbGU6IHNlc3Npb24udXNlci5yb2xlXG4gICAgICB9KSxcbiAgICB9KTtcblxuICAgIGlmICghcmVzcG9uc2Uub2spIHtcbiAgICAgIGNvbnN0IGVycm9yRGF0YSA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKTtcbiAgICAgIHJldHVybiBOZXh0UmVzcG9uc2UuanNvbihcbiAgICAgICAgeyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6IGVycm9yRGF0YS5lcnJvciB8fCAnRmFpbGVkIHRvIGNyZWF0ZSBicmlkZ2UgdG9rZW4nIH0sXG4gICAgICAgIHsgc3RhdHVzOiByZXNwb25zZS5zdGF0dXMgfVxuICAgICAgKTtcbiAgICB9XG5cbiAgICBjb25zdCBkYXRhID0gYXdhaXQgcmVzcG9uc2UuanNvbigpO1xuICAgIHJldHVybiBOZXh0UmVzcG9uc2UuanNvbihkYXRhKTtcblxuICB9IGNhdGNoIChlcnJvcikge1xuICAgIGNvbnNvbGUuZXJyb3IoJ0JyaWRnZSB0b2tlbiBlcnJvcjonLCBlcnJvcik7XG4gICAgcmV0dXJuIE5leHRSZXNwb25zZS5qc29uKFxuICAgICAgeyBzdWNjZXNzOiBmYWxzZSwgZXJyb3I6ICdJbnRlcm5hbCBzZXJ2ZXIgZXJyb3InIH0sXG4gICAgICB7IHN0YXR1czogNTAwIH1cbiAgICApO1xuICB9XG59XG4iXSwibmFtZXMiOlsiTmV4dFJlc3BvbnNlIiwiZ2V0U2VydmVyU2Vzc2lvbiIsImF1dGhPcHRpb25zIiwiZHluYW1pYyIsIlBPU1QiLCJzZXNzaW9uIiwidXNlciIsImlkIiwiZW1haWwiLCJyb2xlIiwianNvbiIsInN1Y2Nlc3MiLCJlcnJvciIsInN0YXR1cyIsInNoYXJlZFNlY3JldCIsInByb2Nlc3MiLCJlbnYiLCJCUklER0VfVE9LRU5fU0hBUkVEX1NFQ1JFVCIsIk5FWFRBVVRIX1NFQ1JFVCIsInJlc3BvbnNlIiwiZmV0Y2giLCJORVhUX1BVQkxJQ19BUElfVVJMIiwibWV0aG9kIiwiaGVhZGVycyIsImJvZHkiLCJKU09OIiwic3RyaW5naWZ5Iiwib2siLCJlcnJvckRhdGEiLCJkYXRhIiwiY29uc29sZSJdLCJzb3VyY2VSb290IjoiIn0=\n//# sourceURL=webpack-internal:///(rsc)/./src/app/api/auth/bridge-token/route.ts\n");

/***/ }),

/***/ "(rsc)/./src/lib/auth.ts":
/*!*************************!*\
  !*** ./src/lib/auth.ts ***!
  \*************************/
/***/ ((__unused_webpack_module, __webpack_exports__, __webpack_require__) => {

eval("__webpack_require__.r(__webpack_exports__);\n/* harmony export */ __webpack_require__.d(__webpack_exports__, {\n/* harmony export */   authOptions: () => (/* binding */ authOptions)\n/* harmony export */ });\n/* harmony import */ var next_auth_providers_credentials__WEBPACK_IMPORTED_MODULE_0__ = __webpack_require__(/*! next-auth/providers/credentials */ \"(rsc)/./node_modules/next-auth/providers/credentials.js\");\n\nconst API_BASE_URL = \"http://localhost:3001\" || 0;\nconst authOptions = {\n    providers: [\n        (0,next_auth_providers_credentials__WEBPACK_IMPORTED_MODULE_0__[\"default\"])({\n            name: \"credentials\",\n            credentials: {\n                email: {\n                    label: \"Email\",\n                    type: \"email\"\n                },\n                password: {\n                    label: \"Password\",\n                    type: \"password\"\n                },\n                mfaCode: {\n                    label: \"MFA Code\",\n                    type: \"text\"\n                },\n                mfaToken: {\n                    label: \"MFA Token\",\n                    type: \"text\"\n                }\n            },\n            async authorize (credentials) {\n                if (!credentials?.email || !credentials?.password) {\n                    return null;\n                }\n                try {\n                    const response = await fetch(`${API_BASE_URL}/api/auth/login`, {\n                        method: \"POST\",\n                        headers: {\n                            \"Content-Type\": \"application/json\"\n                        },\n                        body: JSON.stringify({\n                            email: credentials.email,\n                            password: credentials.password,\n                            mfaCode: credentials.mfaCode,\n                            mfaToken: credentials.mfaToken\n                        })\n                    });\n                    if (!response.ok) {\n                        return null;\n                    }\n                    const payload = await response.json();\n                    if (payload?.data?.mfaRequired) {\n                        return null;\n                    }\n                    const user = payload?.data?.user;\n                    if (!user?.id || !user?.email) {\n                        return null;\n                    }\n                    return {\n                        id: user.id,\n                        email: user.email,\n                        name: user.name,\n                        role: user.role,\n                        mfaEnabled: Boolean(user.mfaEnabled)\n                    };\n                } catch (error) {\n                    console.error(\"NextAuth authorize error:\", error);\n                    return null;\n                }\n            }\n        })\n    ],\n    pages: {\n        signIn: \"/login\"\n    },\n    session: {\n        strategy: \"jwt\",\n        maxAge: 8 * 60 * 60\n    },\n    callbacks: {\n        async jwt ({ token, user }) {\n            if (user) {\n                token.role = user.role;\n                token.mfaEnabled = user.mfaEnabled;\n            }\n            return token;\n        },\n        async session ({ session, token }) {\n            if (token && session.user) {\n                session.user.id = token.sub;\n                session.user.role = token.role;\n                session.user.mfaEnabled = Boolean(token.mfaEnabled);\n            }\n            return session;\n        }\n    },\n    secret: process.env.NEXTAUTH_SECRET,\n    debug: \"development\" === \"development\"\n};\n//# sourceURL=[module]\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJmaWxlIjoiKHJzYykvLi9zcmMvbGliL2F1dGgudHMiLCJtYXBwaW5ncyI6Ijs7Ozs7QUFDa0U7QUFFbEUsTUFBTUMsZUFBZUMsdUJBQStCLElBQUksQ0FBdUI7QUFFeEUsTUFBTUcsY0FBK0I7SUFDMUNDLFdBQVc7UUFDVE4sMkVBQW1CQSxDQUFDO1lBQ2xCTyxNQUFNO1lBQ05DLGFBQWE7Z0JBQ1hDLE9BQU87b0JBQUVDLE9BQU87b0JBQVNDLE1BQU07Z0JBQVE7Z0JBQ3ZDQyxVQUFVO29CQUFFRixPQUFPO29CQUFZQyxNQUFNO2dCQUFXO2dCQUNoREUsU0FBUztvQkFBRUgsT0FBTztvQkFBWUMsTUFBTTtnQkFBTztnQkFDM0NHLFVBQVU7b0JBQUVKLE9BQU87b0JBQWFDLE1BQU07Z0JBQU87WUFDL0M7WUFDQSxNQUFNSSxXQUFVUCxXQUFXO2dCQUN6QixJQUFJLENBQUNBLGFBQWFDLFNBQVMsQ0FBQ0QsYUFBYUksVUFBVTtvQkFDakQsT0FBTztnQkFDVDtnQkFFQSxJQUFJO29CQUNGLE1BQU1JLFdBQVcsTUFBTUMsTUFBTSxDQUFDLEVBQUVoQixhQUFhLGVBQWUsQ0FBQyxFQUFFO3dCQUM3RGlCLFFBQVE7d0JBQ1JDLFNBQVM7NEJBQ1AsZ0JBQWdCO3dCQUNsQjt3QkFDQUMsTUFBTUMsS0FBS0MsU0FBUyxDQUFDOzRCQUNuQmIsT0FBT0QsWUFBWUMsS0FBSzs0QkFDeEJHLFVBQVVKLFlBQVlJLFFBQVE7NEJBQzlCQyxTQUFTTCxZQUFZSyxPQUFPOzRCQUM1QkMsVUFBVU4sWUFBWU0sUUFBUTt3QkFDaEM7b0JBQ0Y7b0JBRUEsSUFBSSxDQUFDRSxTQUFTTyxFQUFFLEVBQUU7d0JBQ2hCLE9BQU87b0JBQ1Q7b0JBRUEsTUFBTUMsVUFBVSxNQUFNUixTQUFTUyxJQUFJO29CQUNuQyxJQUFJRCxTQUFTRSxNQUFNQyxhQUFhO3dCQUM5QixPQUFPO29CQUNUO29CQUNBLE1BQU1DLE9BQU9KLFNBQVNFLE1BQU1FO29CQUU1QixJQUFJLENBQUNBLE1BQU1DLE1BQU0sQ0FBQ0QsTUFBTW5CLE9BQU87d0JBQzdCLE9BQU87b0JBQ1Q7b0JBRUEsT0FBTzt3QkFDTG9CLElBQUlELEtBQUtDLEVBQUU7d0JBQ1hwQixPQUFPbUIsS0FBS25CLEtBQUs7d0JBQ2pCRixNQUFNcUIsS0FBS3JCLElBQUk7d0JBQ2Z1QixNQUFNRixLQUFLRSxJQUFJO3dCQUNmQyxZQUFZQyxRQUFRSixLQUFLRyxVQUFVO29CQUNyQztnQkFDRixFQUFFLE9BQU9FLE9BQU87b0JBQ2RDLFFBQVFELEtBQUssQ0FBQyw2QkFBNkJBO29CQUMzQyxPQUFPO2dCQUNUO1lBQ0Y7UUFDRjtLQUNEO0lBQ0RFLE9BQU87UUFDTEMsUUFBUTtJQUNWO0lBQ0FDLFNBQVM7UUFDUEMsVUFBVTtRQUNWQyxRQUFRLElBQUksS0FBSztJQUNuQjtJQUNBQyxXQUFXO1FBQ1QsTUFBTUMsS0FBSSxFQUFFQyxLQUFLLEVBQUVkLElBQUksRUFBRTtZQUN2QixJQUFJQSxNQUFNO2dCQUNSYyxNQUFNWixJQUFJLEdBQUdGLEtBQUtFLElBQUk7Z0JBQ3RCWSxNQUFNWCxVQUFVLEdBQUdILEtBQUtHLFVBQVU7WUFDcEM7WUFDQSxPQUFPVztRQUNUO1FBQ0EsTUFBTUwsU0FBUSxFQUFFQSxPQUFPLEVBQUVLLEtBQUssRUFBRTtZQUM5QixJQUFJQSxTQUFTTCxRQUFRVCxJQUFJLEVBQUU7Z0JBQ3pCUyxRQUFRVCxJQUFJLENBQUNDLEVBQUUsR0FBR2EsTUFBTUMsR0FBRztnQkFDM0JOLFFBQVFULElBQUksQ0FBQ0UsSUFBSSxHQUFHWSxNQUFNWixJQUFJO2dCQUM5Qk8sUUFBUVQsSUFBSSxDQUFDRyxVQUFVLEdBQUdDLFFBQVFVLE1BQU1YLFVBQVU7WUFDcEQ7WUFDQSxPQUFPTTtRQUNUO0lBQ0Y7SUFDQU8sUUFBUTFDLFFBQVFDLEdBQUcsQ0FBQzBDLGVBQWU7SUFDbkNDLE9BQU81QyxrQkFBeUI7QUFDbEMsRUFBRSIsInNvdXJjZXMiOlsid2VicGFjazovL2VkdWNhdGlvbmFsLXNjaGVkdWxpbmctZnJvbnRlbmQvLi9zcmMvbGliL2F1dGgudHM/NjY5MiJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBOZXh0QXV0aE9wdGlvbnMgfSBmcm9tIFwibmV4dC1hdXRoXCI7XG5pbXBvcnQgQ3JlZGVudGlhbHNQcm92aWRlciBmcm9tIFwibmV4dC1hdXRoL3Byb3ZpZGVycy9jcmVkZW50aWFsc1wiO1xuXG5jb25zdCBBUElfQkFTRV9VUkwgPSBwcm9jZXNzLmVudi5ORVhUX1BVQkxJQ19BUElfVVJMIHx8IFwiaHR0cDovL2xvY2FsaG9zdDozMDAxXCI7XG5cbmV4cG9ydCBjb25zdCBhdXRoT3B0aW9uczogTmV4dEF1dGhPcHRpb25zID0ge1xuICBwcm92aWRlcnM6IFtcbiAgICBDcmVkZW50aWFsc1Byb3ZpZGVyKHtcbiAgICAgIG5hbWU6IFwiY3JlZGVudGlhbHNcIixcbiAgICAgIGNyZWRlbnRpYWxzOiB7XG4gICAgICAgIGVtYWlsOiB7IGxhYmVsOiBcIkVtYWlsXCIsIHR5cGU6IFwiZW1haWxcIiB9LFxuICAgICAgICBwYXNzd29yZDogeyBsYWJlbDogXCJQYXNzd29yZFwiLCB0eXBlOiBcInBhc3N3b3JkXCIgfSxcbiAgICAgICAgbWZhQ29kZTogeyBsYWJlbDogXCJNRkEgQ29kZVwiLCB0eXBlOiBcInRleHRcIiB9LFxuICAgICAgICBtZmFUb2tlbjogeyBsYWJlbDogXCJNRkEgVG9rZW5cIiwgdHlwZTogXCJ0ZXh0XCIgfVxuICAgICAgfSxcbiAgICAgIGFzeW5jIGF1dGhvcml6ZShjcmVkZW50aWFscykge1xuICAgICAgICBpZiAoIWNyZWRlbnRpYWxzPy5lbWFpbCB8fCAhY3JlZGVudGlhbHM/LnBhc3N3b3JkKSB7XG4gICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgIH1cblxuICAgICAgICB0cnkge1xuICAgICAgICAgIGNvbnN0IHJlc3BvbnNlID0gYXdhaXQgZmV0Y2goYCR7QVBJX0JBU0VfVVJMfS9hcGkvYXV0aC9sb2dpbmAsIHtcbiAgICAgICAgICAgIG1ldGhvZDogXCJQT1NUXCIsXG4gICAgICAgICAgICBoZWFkZXJzOiB7XG4gICAgICAgICAgICAgIFwiQ29udGVudC1UeXBlXCI6IFwiYXBwbGljYXRpb24vanNvblwiXG4gICAgICAgICAgICB9LFxuICAgICAgICAgICAgYm9keTogSlNPTi5zdHJpbmdpZnkoe1xuICAgICAgICAgICAgICBlbWFpbDogY3JlZGVudGlhbHMuZW1haWwsXG4gICAgICAgICAgICAgIHBhc3N3b3JkOiBjcmVkZW50aWFscy5wYXNzd29yZCxcbiAgICAgICAgICAgICAgbWZhQ29kZTogY3JlZGVudGlhbHMubWZhQ29kZSxcbiAgICAgICAgICAgICAgbWZhVG9rZW46IGNyZWRlbnRpYWxzLm1mYVRva2VuXG4gICAgICAgICAgICB9KVxuICAgICAgICAgIH0pO1xuXG4gICAgICAgICAgaWYgKCFyZXNwb25zZS5vaykge1xuICAgICAgICAgICAgcmV0dXJuIG51bGw7XG4gICAgICAgICAgfVxuXG4gICAgICAgICAgY29uc3QgcGF5bG9hZCA9IGF3YWl0IHJlc3BvbnNlLmpzb24oKTtcbiAgICAgICAgICBpZiAocGF5bG9hZD8uZGF0YT8ubWZhUmVxdWlyZWQpIHtcbiAgICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICAgIH1cbiAgICAgICAgICBjb25zdCB1c2VyID0gcGF5bG9hZD8uZGF0YT8udXNlcjtcblxuICAgICAgICAgIGlmICghdXNlcj8uaWQgfHwgIXVzZXI/LmVtYWlsKSB7XG4gICAgICAgICAgICByZXR1cm4gbnVsbDtcbiAgICAgICAgICB9XG5cbiAgICAgICAgICByZXR1cm4ge1xuICAgICAgICAgICAgaWQ6IHVzZXIuaWQsXG4gICAgICAgICAgICBlbWFpbDogdXNlci5lbWFpbCxcbiAgICAgICAgICAgIG5hbWU6IHVzZXIubmFtZSxcbiAgICAgICAgICAgIHJvbGU6IHVzZXIucm9sZSxcbiAgICAgICAgICAgIG1mYUVuYWJsZWQ6IEJvb2xlYW4odXNlci5tZmFFbmFibGVkKVxuICAgICAgICAgIH07XG4gICAgICAgIH0gY2F0Y2ggKGVycm9yKSB7XG4gICAgICAgICAgY29uc29sZS5lcnJvcihcIk5leHRBdXRoIGF1dGhvcml6ZSBlcnJvcjpcIiwgZXJyb3IpO1xuICAgICAgICAgIHJldHVybiBudWxsO1xuICAgICAgICB9XG4gICAgICB9XG4gICAgfSlcbiAgXSxcbiAgcGFnZXM6IHtcbiAgICBzaWduSW46IFwiL2xvZ2luXCIsXG4gIH0sXG4gIHNlc3Npb246IHtcbiAgICBzdHJhdGVneTogXCJqd3RcIixcbiAgICBtYXhBZ2U6IDggKiA2MCAqIDYwLFxuICB9LFxuICBjYWxsYmFja3M6IHtcbiAgICBhc3luYyBqd3QoeyB0b2tlbiwgdXNlciB9KSB7XG4gICAgICBpZiAodXNlcikge1xuICAgICAgICB0b2tlbi5yb2xlID0gdXNlci5yb2xlO1xuICAgICAgICB0b2tlbi5tZmFFbmFibGVkID0gdXNlci5tZmFFbmFibGVkO1xuICAgICAgfVxuICAgICAgcmV0dXJuIHRva2VuO1xuICAgIH0sXG4gICAgYXN5bmMgc2Vzc2lvbih7IHNlc3Npb24sIHRva2VuIH0pIHtcbiAgICAgIGlmICh0b2tlbiAmJiBzZXNzaW9uLnVzZXIpIHtcbiAgICAgICAgc2Vzc2lvbi51c2VyLmlkID0gdG9rZW4uc3ViITtcbiAgICAgICAgc2Vzc2lvbi51c2VyLnJvbGUgPSB0b2tlbi5yb2xlO1xuICAgICAgICBzZXNzaW9uLnVzZXIubWZhRW5hYmxlZCA9IEJvb2xlYW4odG9rZW4ubWZhRW5hYmxlZCk7XG4gICAgICB9XG4gICAgICByZXR1cm4gc2Vzc2lvbjtcbiAgICB9XG4gIH0sXG4gIHNlY3JldDogcHJvY2Vzcy5lbnYuTkVYVEFVVEhfU0VDUkVULFxuICBkZWJ1ZzogcHJvY2Vzcy5lbnYuTk9ERV9FTlYgPT09IFwiZGV2ZWxvcG1lbnRcIixcbn07XG4iXSwibmFtZXMiOlsiQ3JlZGVudGlhbHNQcm92aWRlciIsIkFQSV9CQVNFX1VSTCIsInByb2Nlc3MiLCJlbnYiLCJORVhUX1BVQkxJQ19BUElfVVJMIiwiYXV0aE9wdGlvbnMiLCJwcm92aWRlcnMiLCJuYW1lIiwiY3JlZGVudGlhbHMiLCJlbWFpbCIsImxhYmVsIiwidHlwZSIsInBhc3N3b3JkIiwibWZhQ29kZSIsIm1mYVRva2VuIiwiYXV0aG9yaXplIiwicmVzcG9uc2UiLCJmZXRjaCIsIm1ldGhvZCIsImhlYWRlcnMiLCJib2R5IiwiSlNPTiIsInN0cmluZ2lmeSIsIm9rIiwicGF5bG9hZCIsImpzb24iLCJkYXRhIiwibWZhUmVxdWlyZWQiLCJ1c2VyIiwiaWQiLCJyb2xlIiwibWZhRW5hYmxlZCIsIkJvb2xlYW4iLCJlcnJvciIsImNvbnNvbGUiLCJwYWdlcyIsInNpZ25JbiIsInNlc3Npb24iLCJzdHJhdGVneSIsIm1heEFnZSIsImNhbGxiYWNrcyIsImp3dCIsInRva2VuIiwic3ViIiwic2VjcmV0IiwiTkVYVEFVVEhfU0VDUkVUIiwiZGVidWciXSwic291cmNlUm9vdCI6IiJ9\n//# sourceURL=webpack-internal:///(rsc)/./src/lib/auth.ts\n");

/***/ })

};
;

// load runtime
var __webpack_require__ = require("../../../../webpack-runtime.js");
__webpack_require__.C(exports);
var __webpack_exec__ = (moduleId) => (__webpack_require__(__webpack_require__.s = moduleId))
var __webpack_exports__ = __webpack_require__.X(0, ["vendor-chunks/next","vendor-chunks/next-auth","vendor-chunks/@babel","vendor-chunks/jose","vendor-chunks/openid-client","vendor-chunks/oauth","vendor-chunks/preact","vendor-chunks/preact-render-to-string","vendor-chunks/uuid","vendor-chunks/yallist","vendor-chunks/lru-cache","vendor-chunks/cookie","vendor-chunks/oidc-token-hash","vendor-chunks/@panva"], () => (__webpack_exec__("(rsc)/./node_modules/next/dist/build/webpack/loaders/next-app-loader.js?name=app%2Fapi%2Fauth%2Fbridge-token%2Froute&page=%2Fapi%2Fauth%2Fbridge-token%2Froute&appPaths=&pagePath=private-next-app-dir%2Fapi%2Fauth%2Fbridge-token%2Froute.ts&appDir=D%3A%5C%D7%A2%D7%91%D7%95%D7%93%D7%94%5C%D7%A1%D7%9E%D7%99%D7%A0%D7%A8%5C%D7%A4%D7%A8%D7%95%D7%99%D7%99%D7%A7%D7%98%20%D7%9B%D7%99%D7%AA%D7%95%D7%AA%20%D7%97%D7%93%D7%A9%5Csrc%5Cfrontend%5Csrc%5Capp&pageExtensions=tsx&pageExtensions=ts&pageExtensions=jsx&pageExtensions=js&rootDir=D%3A%5C%D7%A2%D7%91%D7%95%D7%93%D7%94%5C%D7%A1%D7%9E%D7%99%D7%A0%D7%A8%5C%D7%A4%D7%A8%D7%95%D7%99%D7%99%D7%A7%D7%98%20%D7%9B%D7%99%D7%AA%D7%95%D7%AA%20%D7%97%D7%93%D7%A9%5Csrc%5Cfrontend&isDev=true&tsconfigPath=tsconfig.json&basePath=&assetPrefix=&nextConfigOutput=&preferredRegion=&middlewareConfig=e30%3D!")));
module.exports = __webpack_exports__;

})();