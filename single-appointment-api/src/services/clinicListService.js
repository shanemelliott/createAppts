import axios from 'axios';
import { getToken } from './tokenService.js';

/**
 * Get base configuration for CWS API calls
 * @returns {Promise<{baseUrl: string, token: string}>}
 */
async function getCwsConfig() {
  const baseUrl = process.env.CWS_API_BASE_URL;
  if (!baseUrl) {
    throw new Error('CWS_API_BASE_URL is not configured');
  }

  const token = await getToken();
  return { baseUrl, token };
}

/**
 * Make a request to the CWS API
 * @param {string} endpoint - API endpoint path
 * @param {string} method - HTTP method
 * @param {object|null} data - Request body for POST/PUT/PATCH
 * @returns {Promise<any>}
 */
async function cwsRequest(endpoint, method = 'GET', data = null) {
  const { baseUrl, token } = await getCwsConfig();
  const url = `${baseUrl}${endpoint}`;

  const config = {
    method,
    url,
    headers: {
      'x-vamf-jwt': token,
      'Content-Type': 'application/json'
    },
    timeout: 30000
  };

  if (data && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
    config.data = data;
  }

  console.log(`[clinicListService] ${method} ${url}`);
  
  try {
    const response = await axios(config);
    // Extract payload from VA API response wrapper
    return response.data.payload || response.data;
  } catch (error) {
    console.error(`[clinicListService] Error:`, error.response?.data || error.message);
    throw error;
  }
}

/**
 * Search clinic lists with optional filters
 * Note: CWS API returns all lists for authenticated user; filtering can be done client-side
 * @param {object} searchParams - Search filters (name, stationId, userId, role) - currently unused by API
 * @returns {Promise<Array>}
 */
async function searchLists(searchParams = {}) {
  // CWS API uses GET to retrieve all lists for the authenticated user
  // API doesn't support server-side filtering via query params or body
  return cwsRequest('/v1_0_0/pcl/lists', 'GET');
}

/**
 * Create a new clinic list
 * @param {object} listData - List data (userId, name, stationId, role, userDefault)
 * @returns {Promise<object>}
 */
async function createList(listData) {
  return cwsRequest('/v1_0_0/pcl/list', 'POST', listData);
}

/**
 * Update a clinic list
 * @param {string} listId - List ID
 * @param {object} updateData - Data to update (e.g., { userDefault: true })
 * @returns {Promise<object>}
 */
async function updateList(listId, updateData) {
  // CWS API uses POST for both create and update
  // When id is present in the data, it performs an update
  const dataWithId = {
    ...updateData,
    id: listId
  };
  return cwsRequest('/v1_0_0/pcl/list', 'POST', dataWithId);
}

/**
 * Get items (clinics) in a specific list
 * @param {string} listId - List ID
 * @returns {Promise<Array>}
 */
async function getListItems(listId) {
  return cwsRequest(`/v1_0_0/pcl/list-items/${listId}`, 'GET');
}

/**
 * Add a clinic to a list
 * @param {string} listId - List ID
 * @param {string} clinicId - Clinic IEN
 * @param {string} clinicName - Clinic name
 * @param {object} data - Additional data (optional)
 * @returns {Promise<object>}
 */
async function addItemToList(listId, clinicId, clinicName, data = {}) {
  const endpoint = `/v1_0_0/pcl/list-item/${listId}/${clinicId}/${encodeURIComponent(clinicName)}`;
  return cwsRequest(endpoint, 'PUT', data);
}

/**
 * Delete an item from a list
 * @param {string} listItemId - List item ID
 * @returns {Promise<object>}
 */
async function deleteListItem(listItemId) {
  return cwsRequest(`/v1_0_0/pcl/list-item/${listItemId}`, 'DELETE');
}

export {
  searchLists,
  createList,
  updateList,
  getListItems,
  addItemToList,
  deleteListItem
};
