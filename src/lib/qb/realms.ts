/**
 * The QuickBooks companies Polaris reads. Customer ids are only unique within
 * one company, so anything matching a document to a vessel by customer id must
 * also check which company it came from.
 *   - JLS Yachts: yachts.qbo_customer_id (the default company, QBO_REALM_ID)
 *   - Waypoint Trading LLC: yacht_qbo_accounts (chandlery, provisioning…)
 */
export const JLS_QBO_REALM = '9341454112300561'
export const WAYPOINT_QBO_REALM = '9341456599242940'
export const WAYPOINT_COMPANY = 'Waypoint Trading LLC'
