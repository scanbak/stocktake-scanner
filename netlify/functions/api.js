/**
 * Netlify Function: api.js
 *
 * Proxy antara frontend dan Google Apps Script.
 * Frontend → POST/GET /api → fungsi ini → Apps Script /exec → balik ke frontend.
 *
 * APPS_SCRIPT_URL mesti diset dalam Netlify environment variables:
 *   Netlify dashboard → Site → Environment variables → Add variable
 *   Key:   APPS_SCRIPT_URL
 *   Value: https://script.google.com/macros/s/AKfycb.../exec
 */

const GAS_URL = process.env.APPS_SCRIPT_URL;

// ============ CORS HEADERS ============
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Content-Type': 'application/json'
};

// ============ ENTRY POINT ============
exports.handler = async function(event) {

  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }

  // Pastikan GAS URL ada
  if (!GAS_URL) {
    return {
      statusCode: 500,
      headers: CORS,
      body: JSON.stringify({
        ok: false,
        msg: 'APPS_SCRIPT_URL not set. Pergi Netlify Dashboard → Environment Variables dan set APPS_SCRIPT_URL.'
      })
    };
  }

  try {
    let gasRes;

    // ---- GET request → forward sebagai GET ke GAS ----
    if (event.httpMethod === 'GET') {
      const action = event.queryStringParameters?.action || 'initial';
      const url = `${GAS_URL}?action=${encodeURIComponent(action)}`;

      gasRes = await fetchGas(url, 'GET', null);

    // ---- POST request → forward sebagai POST ke GAS ----
    } else if (event.httpMethod === 'POST') {
      let body;
      try {
        body = JSON.parse(event.body || '{}');
      } catch (e) {
        return {
          statusCode: 400,
          headers: CORS,
          body: JSON.stringify({ ok: false, msg: 'Invalid JSON body' })
        };
      }

      gasRes = await fetchGas(GAS_URL, 'POST', body);

    } else {
      return {
        statusCode: 405,
        headers: CORS,
        body: JSON.stringify({ ok: false, msg: 'Method not allowed' })
      };
    }

    return {
      statusCode: 200,
      headers: CORS,
      body: JSON.stringify(gasRes)
    };

  } catch (err) {
    console.error('Proxy error:', err);
    return {
      statusCode: 502,
      headers: CORS,
      body: JSON.stringify({
        ok: false,
        msg: 'Proxy error: ' + err.message
      })
    };
  }
};

// ============ HELPER: Fetch ke Apps Script ============
async function fetchGas(url, method, body) {
  const opts = {
    method,
    redirect: 'follow',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' }
  };

  if (method === 'POST' && body !== null) {
    opts.body = JSON.stringify(body);
  }

  // Apps Script selalu redirect dari /exec ke URL sebenar.
  // Node fetch follow redirect secara default.
  const response = await fetch(url, opts);

  if (!response.ok) {
    throw new Error(`Apps Script returned HTTP ${response.status}`);
  }

  const text = await response.text();

  // Apps Script kadang return HTML error page — detect dan handle.
  if (text.trim().startsWith('<!DOCTYPE') || text.trim().startsWith('<html')) {
    throw new Error('Apps Script returned HTML instead of JSON. Pastikan deployment type adalah Web app dan Who has access = Anyone.');
  }

  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error('Apps Script returned non-JSON: ' + text.substring(0, 200));
  }
}
