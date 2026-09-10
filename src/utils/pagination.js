/**
 * Pagination helper for Express endpoints and PostgreSQL queries
 */

/**
 * Parse pagination query parameters safely
 * @param {import('express').Request} req 
 * @param {number} defaultLimit 
 * @param {number} maxLimit 
 */
function getPaginationParams(req, defaultLimit = 10, maxLimit = 100) {
  let page = parseInt(req.query.page, 10);
  let limit = parseInt(req.query.limit, 10);

  if (isNaN(page) || page < 1) page = 1;
  if (isNaN(limit) || limit < 1) limit = defaultLimit;
  if (limit > maxLimit) limit = maxLimit;

  const offset = (page - 1) * limit;

  return { page, limit, offset };
}

/**
 * Standardize paginated JSON response
 * @param {Array} data 
 * @param {number} totalCount 
 * @param {number} page 
 * @param {number} limit 
 */
function formatPaginatedResponse(data, totalCount, page, limit) {
  const total = parseInt(totalCount, 10) || 0;
  const totalPages = Math.ceil(total / limit) || (total > 0 ? 1 : 0);

  return {
    success: true,
    data,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    },
  };
}

module.exports = {
  getPaginationParams,
  formatPaginatedResponse,
};
