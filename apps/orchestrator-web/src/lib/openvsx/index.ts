/**
 * OpenVSX API Client
 *
 * Provides a typed client for interacting with the OpenVSX extension marketplace
 * through the backend proxy routes.
 */

export {
  // Functions
  searchExtensions,
  getExtensionMetadata,
  downloadVsix,
  // Error class
  OpenVSXError,
  // Types
  type OpenVSXSearchResult,
  type OpenVSXExtension,
  type OpenVSXExtensionSummary,
  type OpenVSXPublisher,
  type OpenVSXFiles,
  type OpenVSXApiError,
  type SearchExtensionsOptions,
} from './client';
