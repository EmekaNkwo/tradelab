/**
 * SYNTHETIC FIXTURE — NOT A REAL BROKER FILE. A minimal MT4-style statement
 * with made-up tickets and prices, for feature and screen tests.
 */
export const SYNTHETIC_MT4_STATEMENT = `<html><body><table>
<tr><td colspan=2><b>Account: 900001</b></td><td colspan=2><b>Currency: USD</b></td></tr>
<tr><td colspan=14><b>Closed Transactions:</b></td></tr>
<tr><td>Ticket</td><td>Open Time</td><td>Type</td><td>Size</td><td>Item</td><td>Price</td><td>S / L</td><td>T / P</td><td>Close Time</td><td>Price</td><td>Commission</td><td>Taxes</td><td>Swap</td><td>Profit</td></tr>
<tr><td>1001</td><td>2026.01.05 08:00</td><td>balance</td><td colspan=10>Deposit</td><td>10 000.00</td></tr>
<tr><td>1002</td><td>2026.01.05 09:15</td><td>buy</td><td>0.10</td><td>eurusd</td><td>1.10000</td><td>1.09500</td><td>1.11000</td><td>2026.01.05 14:20</td><td>1.11000</td><td>-0.70</td><td>0.00</td><td>-0.12</td><td>100.00</td></tr>
<tr><td>1004</td><td>2026.01.07 10:00</td><td>sell</td><td>0.20</td><td>gbpusd</td><td>1.27000</td><td>0</td><td>0</td><td>2026.01.07 12:30</td><td>1.27500</td><td>-1.40</td><td>0.00</td><td>0.00</td><td>-100.00</td></tr>
<tr><td colspan=12><b>Closed P/L:</b></td><td colspan=2>0.00</td></tr>
</table></body></html>`;
