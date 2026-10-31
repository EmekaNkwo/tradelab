/**
 * SYNTHETIC FIXTURES — NOT REAL BROKER FILES.
 *
 * Every statement below was written by hand for these tests. They follow the
 * general layout of MetaTrader 4 and MetaTrader 5 HTML statements, but the
 * account numbers, tickets, prices and results are made up. A check against
 * real broker exports is still needed (spec §37.2).
 */
import { dec } from '../../../shared/decimal';
import { MAX_STATEMENT_BYTES, parseMtNumber, parseMtTime, parseMtStatement, utf8ByteLength, type ParsedStatement } from '..';

const MT4_STATEMENT = `<html><head><title>Statement: 900001 - Demo Learner</title>
<style>td { font: 8pt Tahoma; }</style></head>
<body>
<table width=820 cellspacing=1 cellpadding=3 border=0>
<tr align=left><td colspan=2><b>Account: 900001</b></td><td colspan=5><b>Name: Demo Learner</b></td><td colspan=2><b>Currency: USD</b></td><td colspan=2><b>Leverage: 1:100</b></td></tr>
<TR ALIGN=left><TD COLSPAN=14><B>Closed Transactions:</B></TD></TR>
<tr align=center bgcolor="#C0C0C0">
  <td>Ticket</td><td nowrap>Open Time</td><td>Type</td><td>Size</td><td>Item</td><td>Price</td><td>S / L</td><td>T / P</td>
  <td nowrap>Close Time</td><td>Price</td><td>Commission</td><td>Taxes</td><td>Swap</td><td>Profit</td>
</tr>
<tr align=right><td>1001</td><td class=msdate>2026.01.05 08:00</td><td>balance</td><td colspan=10 align=left>Deposit</td><td>10 000.00</td></tr>
<tr bgcolor=#E0E0E0 align=right><td title="[tp]">1002</td><td>2026.01.05 09:15:30</td><td>buy</td><td>0.10</td><td>eurusd</td><td>1.10000</td><td>1.09500</td><td>1.11000</td><td>2026.01.05 14:20:05</td><td>1.11000</td><td>-0.70</td><td>0.00</td><td>-0.12</td><td>100.00</td></tr>
<tr align=right><td>1003</td><td>2026.01.06 09:00</td><td>buy limit</td><td>0.10</td><td>eurusd</td><td>1.08000</td><td>0.00000</td><td>0.00000</td><td>2026.01.06 18:00</td><td>1.08500</td><td colspan=4 align=center>cancelled</td></tr>
<tr bgcolor=#E0E0E0 align=right><td>1004</td><td>2026.01.07 10:00</td><td>sell</td><td>0.20</td><td>gbpusd</td><td>1.27000</td><td>0.00000</td><td>0</td><td>2026.01.07 12:30</td><td>1.27500</td><td>-1.40</td><td>-0.10</td><td>0.00</td><td>-100.00</td></tr>
<tr align=right><td colspan=10>&nbsp;</td><td>-2.10</td><td>-0.10</td><td>-0.12</td><td>0.00</td></tr>
<tr align=right><td colspan=12 align=right><b>Closed P/L:</b></td><td colspan=2>0.00</td></tr>
<tr align=left><td colspan=14><b>Open Trades:</b></td></tr>
<tr align=right><td>1005</td><td>2026.01.08 10:00</td><td>buy</td><td>0.10</td><td>usdjpy</td><td>150.000</td><td>0</td><td>0</td><td>&nbsp;</td><td>150.500</td><td>0.00</td><td>0.00</td><td>0.00</td><td>33.00</td></tr>
</table></body></html>`;

/** MT5 layout with columns in a deliberately different order and hidden spacer cells. */
const MT5_STATEMENT = `<!DOCTYPE html><html><body>
<div><table cellspacing="1" cellpadding="3" border="0">
<tr><th colspan="14"><div style="font: 10pt Tahoma"><b>Trade History Report</b></div></th></tr>
<tr><th colspan="3" align="right">Account:</th><th colspan="11" align="left"><b>800002 (USD, Demo-Server, demo, Hedge)</b></th></tr>
<tr><th colspan="3" align="right">Currency:</th><th colspan="11" align="left"><b>EUR</b></th></tr>
<tr><td colspan="14" style="height: 10px"></td></tr>
<tr align="center"><th colspan="14" style="height: 25px"><div><b>Positions</b></div></th></tr>
<tr align="center" bgcolor="#E5F0FC">
  <td nowrap><b>Time</b></td><td><b>Position</b></td><td><b>Symbol</b></td><td><b>Type</b></td>
  <td class="hidden" colspan="2"><b></b></td>
  <td><b>Volume</b></td><td><b>Price</b></td><td><b>T / P</b></td><td><b>S / L</b></td>
  <td nowrap><b>Time</b></td><td><b>Price</b></td><td><b>Swap</b></td><td><b>Commission</b></td><td><b>Profit</b></td>
</tr>
<tr bgcolor="#FFFFFF" align="right">
  <td>2026.02.02 10:00:00</td><td>5000001</td><td>XAUUSD</td><td>buy</td><td class="hidden" colspan="2"></td>
  <td>0.10 / 0.10</td><td>2 030.50</td><td>2 050.00</td><td>2 020.00</td>
  <td>2026.02.02 16:45:10</td><td>2 050.00</td><td>0.00</td><td>-0.60</td><td>195.00</td>
</tr>
<tr bgcolor="#F7F7F7" align="right">
  <td>2026.02.03 08:30:00</td><td>5000002</td><td>EURUSD.m</td><td>sell</td><td class="hidden" colspan="2"></td>
  <td>1.00</td><td>1.08000</td><td></td><td>0</td>
  <td>2026.02.04 09:00:00</td><td>1.07000</td><td>-3.25</td><td>-7.00</td><td>1&nbsp;000.00</td>
</tr>
<tr align="center"><th colspan="14"><div><b>Orders</b></div></th></tr>
<tr align="center"><td>Open Time</td><td>Order</td><td>Symbol</td><td>Type</td><td>Volume</td><td>Price</td><td>S / L</td><td>T / P</td><td>Time</td><td>State</td><td>Comment</td></tr>
<tr><td>2026.02.02 10:00:00</td><td>6000001</td><td>XAUUSD</td><td>buy</td><td>0.10 / 0.10</td><td>market</td><td></td><td></td><td>2026.02.02 10:00:00</td><td>filled</td><td></td></tr>
</table></div></body></html>`;

function mt4WithRows(rows: string): string {
  return `<table><tr><td colspan=14><b>Closed Transactions:</b></td></tr>
<tr><td>Ticket</td><td>Open Time</td><td>Type</td><td>Size</td><td>Item</td><td>Price</td><td>S / L</td><td>T / P</td><td>Close Time</td><td>Price</td><td>Commission</td><td>Taxes</td><td>Swap</td><td>Profit</td></tr>
${rows}
<tr><td colspan=14><b>Open Trades:</b></td></tr></table>`;
}

function mt4Row(ticket: string, overrides: Partial<Record<'type' | 'size' | 'open' | 'close' | 'sl' | 'tp' | 'price' | 'profit', string>> = {}): string {
  const v = { type: 'buy', size: '0.10', open: '2026.03.02 10:00', close: '2026.03.02 11:00', sl: '0', tp: '0', price: '1.20000', profit: '5.00', ...overrides };
  return `<tr><td>${ticket}</td><td>${v.open}</td><td>${v.type}</td><td>${v.size}</td><td>eurusd</td><td>${v.price}</td><td>${v.sl}</td><td>${v.tp}</td><td>${v.close}</td><td>1.20050</td><td>0.00</td><td>0.00</td><td>0.00</td><td>${v.profit}</td></tr>`;
}

function parseOk(html: string): ParsedStatement {
  const result = parseMtStatement(html);
  if (!result.ok) throw new Error(`expected ok, got ${result.error.message}`);
  return result.value;
}

describe('parseMtStatement — MT4', () => {
  const parsed = parseOk(MT4_STATEMENT);

  it('detects the platform and account currency', () => {
    expect(parsed.platform).toBe('mt4');
    expect(parsed.accountCurrency).toBe('USD');
  });

  it('keeps buy and sell rows only, and stops at the total row', () => {
    expect(parsed.trades.map((t) => t.ticket)).toEqual(['1002', '1004']);
  });

  it('records why balance and cancelled pending rows were skipped', () => {
    expect(parsed.skipped).toEqual([
      { row: 1, reason: expect.stringMatching(/balance/i) },
      { row: 3, reason: expect.stringMatching(/pending order/i) },
    ]);
  });

  it('reads a buy trade in full', () => {
    const buy = parsed.trades[0];
    expect(buy).toMatchObject({
      externalId: 'mt4:900001:1002',
      symbol: 'EURUSD',
      side: 'buy',
      openTime: '2026-01-05T09:15:30',
      closeTime: '2026-01-05T14:20:05',
    });
    expect(buy?.volume.equals(dec('0.10'))).toBe(true);
    expect(buy?.openPrice.equals(dec('1.1'))).toBe(true);
    expect(buy?.closePrice.equals(dec('1.11'))).toBe(true);
    expect(buy?.stopLoss?.equals(dec('1.095'))).toBe(true);
    expect(buy?.takeProfit?.equals(dec('1.11'))).toBe(true);
    expect(buy?.commission.equals(dec('-0.70'))).toBe(true);
    expect(buy?.swap.equals(dec('-0.12'))).toBe(true);
    expect(buy?.profit.equals(dec(100))).toBe(true);
  });

  it('reads a sell trade, adds taxes to commission, and turns 0 stops into null', () => {
    const sell = parsed.trades[1];
    expect(sell?.side).toBe('sell');
    expect(sell?.openTime).toBe('2026-01-07T10:00:00');
    expect(sell?.stopLoss).toBeNull();
    expect(sell?.takeProfit).toBeNull();
    expect(sell?.commission.equals(dec('-1.50'))).toBe(true);
    expect(sell?.profit.equals(dec(-100))).toBe(true);
  });
});

describe('parseMtStatement — MT5', () => {
  const parsed = parseOk(MT5_STATEMENT);

  it('detects the platform and reads only the Positions section', () => {
    expect(parsed.platform).toBe('mt5');
    expect(parsed.trades.map((t) => t.externalId)).toEqual(['mt5:800002:5000001', 'mt5:800002:5000002']);
    expect(parsed.skipped).toEqual([]);
  });

  it('finds columns by header text, whatever their order', () => {
    const gold = parsed.trades[0];
    expect(gold?.symbol).toBe('XAUUSD');
    expect(gold?.openTime).toBe('2026-02-02T10:00:00');
    expect(gold?.closeTime).toBe('2026-02-02T16:45:10');
    expect(gold?.takeProfit?.equals(dec(2050))).toBe(true);
    expect(gold?.stopLoss?.equals(dec(2020))).toBe(true);
    expect(gold?.swap.isZero()).toBe(true);
    expect(gold?.commission.equals(dec('-0.60'))).toBe(true);
  });

  it('takes the first number of an "a / b" volume and reads spaced thousands', () => {
    const gold = parsed.trades[0];
    expect(gold?.volume.equals(dec('0.1'))).toBe(true);
    expect(gold?.openPrice.equals(dec('2030.50'))).toBe(true);
  });

  it('reads a sell with a blank take profit and a 0 stop loss', () => {
    const sell = parsed.trades[1];
    expect(sell?.side).toBe('sell');
    expect(sell?.symbol).toBe('EURUSD.M');
    expect(sell?.takeProfit).toBeNull();
    expect(sell?.stopLoss).toBeNull();
    expect(sell?.swap.equals(dec('-3.25'))).toBe(true);
    expect(sell?.profit.equals(dec(1000))).toBe(true);
  });

  it('detects the currency when label and value are in separate cells', () => {
    expect(parsed.accountCurrency).toBe('EUR');
  });
});

describe('parseMtStatement — tolerance', () => {
  it('handles entities, nested tags, upper-case tags and missing closing tags', () => {
    const html = `<TABLE><TR><TD COLSPAN=14><font><B>Closed&#32;Transactions:</B></font>
<TR><TD>Ticket<TD>Open Time<TD>Type<TD>Size<TD>Item<TD>Price<TD>S&nbsp;/&nbsp;L<TD>T / P<TD>Close Time<TD>Price<TD>Commission<TD>Taxes<TD>Swap<TD>Profit
<TR><TD><span>2001</span><TD>2026.03.02&nbsp;10:00<TD><b>sell</b><TD>1&#x20;000.00<TD>us30&amp;co<TD>39&nbsp;000.5<TD>0<TD>0<TD>2026.03.02 11:00<TD>38 900.5<TD>&#8722;2.00<TD>0<TD>0<TD>1&nbsp;234.56
</TABLE>`;
    const parsed = parseOk(html);
    const trade = parsed.trades[0];
    expect(trade?.ticket).toBe('2001');
    expect(trade?.symbol).toBe('US30&CO');
    expect(trade?.volume.equals(dec(1000))).toBe(true);
    expect(trade?.openPrice.equals(dec('39000.5'))).toBe(true);
    expect(trade?.commission.equals(dec(-2))).toBe(true);
    expect(trade?.profit.equals(dec('1234.56'))).toBe(true);
    expect(parsed.accountCurrency).toBeNull();
  });

  it('decodes entities only once', () => {
    const html = mt4WithRows(mt4Row('3001').replace('<td>eurusd</td>', '<td>a&amp;nbsp;b</td>'));
    expect(parseOk(html).trades[0]?.symbol).toBe('A&NBSP;B');
  });

  it('skips malformed rows with a reason and keeps the good ones', () => {
    const html = mt4WithRows(
      [
        mt4Row('3001'),
        mt4Row('3002', { size: 'abc' }),
        mt4Row('3003', { open: '2026.13.40 10:00' }),
        mt4Row('3004', { profit: '1,234.00' }),
        mt4Row('3005', { open: '2026.03.02 12:00', close: '2026.03.02 11:00' }),
        mt4Row('x3006'),
        mt4Row('3007', { price: '-1' }),
        mt4Row('3008', { type: 'credit' }),
        mt4Row('3009', { type: 'buy stop' }),
        mt4Row('3010', { type: 'transfer' }),
        mt4Row('3011', { sl: 'n/a' }),
        mt4Row('3001'),
      ].join('\n'),
    );
    const parsed = parseOk(html);
    expect(parsed.trades.map((t) => t.ticket)).toEqual(['3001']);
    expect(parsed.skipped.map((s) => s.row)).toEqual([2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    const reasons = parsed.skipped.map((s) => s.reason);
    expect(reasons[0]).toMatch(/Volume "abc" is not a number/);
    expect(reasons[1]).toMatch(/Open time/);
    expect(reasons[2]).toMatch(/Profit "1,234.00"/);
    expect(reasons[3]).toMatch(/before open time/);
    expect(reasons[4]).toMatch(/Ticket "x3006"/);
    expect(reasons[5]).toMatch(/Open price/);
    expect(reasons[6]).toMatch(/Credit/);
    expect(reasons[7]).toMatch(/Pending order/);
    expect(reasons[8]).toMatch(/"transfer"/);
    expect(reasons[9]).toMatch(/Stop loss/);
    expect(reasons[10]).toMatch(/more than once/);
  });

  it('gives every trade a unique externalId', () => {
    const html = mt4WithRows([mt4Row('4001'), mt4Row('4002'), mt4Row('4002'), mt4Row('4003', { type: 'sell' })].join('\n'));
    const ids = parseOk(html).trades.map((t) => t.externalId);
    expect(ids).toEqual(['mt4:4001', 'mt4:4002', 'mt4:4003']);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('falls back to the usual column order when there is no header row', () => {
    const html = `<table><tr><td colspan=14>Closed Transactions:</td></tr>${mt4Row('5001', { type: 'sell' })}</table>`;
    expect(parseOk(html).trades[0]?.side).toBe('sell');
  });

  it('ignores script content', () => {
    const html = `<script>var s = "<tr><td>Closed Transactions:</td></tr>";</script>${mt4WithRows(mt4Row('6001'))}`;
    expect(parseOk(html).trades).toHaveLength(1);
  });

  it('ignores HTML comments, closed or not', () => {
    const html = `<!-- <tr><td>9999</td></tr> -->${mt4WithRows(mt4Row('6002'))}<!-- unclosed <tr><td>x`;
    expect(parseOk(html).trades.map((t) => t.ticket)).toEqual(['6002']);
  });

  it('stays fast on hostile input with many unclosed tags', () => {
    const hostile = '<a'.repeat(400_000) + '<!--'.repeat(100_000) + '&#'.repeat(100_000);
    const result = parseMtStatement(hostile);
    expect(result.ok).toBe(false);
  }, 5000);
});

describe('parseMtStatement — errors', () => {
  it('rejects a file that is not a statement', () => {
    for (const html of ['<html><body><p>Hello</p></body></html>', 'plain text', '<table><tr><td>a</td></tr></table>']) {
      const result = parseMtStatement(html);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe('ValidationError');
        expect(result.error.message).toMatch(/not a MetaTrader/);
      }
    }
  });

  it('rejects an empty file', () => {
    const result = parseMtStatement('   ');
    expect(!result.ok && result.error.kind).toBe('ValidationError');
  });

  it('rejects a statement with no closed trades, listing the skipped rows', () => {
    const result = parseMtStatement(mt4WithRows(mt4Row('7001', { type: 'balance' })));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toMatch(/no closed buy or sell trades/);
      expect(result.error.issues?.[0]).toMatch(/^Row 1: Balance/);
    }
  });

  it('rejects a file over the size limit', () => {
    const big = mt4WithRows(mt4Row('8001')) + ' '.repeat(MAX_STATEMENT_BYTES);
    const result = parseMtStatement(big);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.message).toMatch(/larger than 5 MB/);
  });

  it('counts multi-byte characters toward the size limit', () => {
    const chars = Math.floor(MAX_STATEMENT_BYTES / 3) + 10;
    const result = parseMtStatement(mt4WithRows(mt4Row('8002')) + '€'.repeat(chars));
    expect(result.ok).toBe(false);
  });
});

describe('helpers', () => {
  it('parseMtNumber reads signs and space separators and rejects the rest', () => {
    expect(parseMtNumber('1 234.56')?.toString()).toBe('1234.56');
    expect(parseMtNumber('+3')?.toString()).toBe('3');
    expect(parseMtNumber('-0.50')?.toString()).toBe('-0.5');
    expect(parseMtNumber('1,234.56')).toBeNull();
    expect(parseMtNumber('')).toBeNull();
    expect(parseMtNumber('1e5')).toBeNull();
  });

  it('parseMtTime normalises MT dates and rejects impossible ones', () => {
    expect(parseMtTime('2026.01.05 09:15')).toBe('2026-01-05T09:15:00');
    expect(parseMtTime('2026.01.05 09:15:30')).toBe('2026-01-05T09:15:30');
    expect(parseMtTime('2026.01.05 24:00')).toBeNull();
    expect(parseMtTime('05.01.2026 09:15')).toBeNull();
  });

  it('utf8ByteLength counts bytes', () => {
    expect(utf8ByteLength('abc')).toBe(3);
    expect(utf8ByteLength('é')).toBe(2);
    expect(utf8ByteLength('€')).toBe(3);
    expect(utf8ByteLength('😀')).toBe(4);
  });
});
