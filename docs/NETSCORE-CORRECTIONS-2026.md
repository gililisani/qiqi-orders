# NetScore-era corrections — 27 orders (2026-08-22)

Truth = what Shopify actually charged (successful sale/capture transactions).
Invoice Δ = NetSuite invoice − charged (positive = revenue overstated). Payment Δ = recorded payment − charged (positive = phantom cash in 100501).
None of these payments is marked cleared (bank-reconciled) in NetSuite.

| Order | Charged (Shopify) | NS invoice | Invoice Δ | NS payment | Payment Δ | Notes |
|---|---|---|---|---|---|---|
| #5621 | $488.90 | INVUS15367 $533.90 | +45.00 | see Payment #PUS15225 | ? (payment via link only — amount not read) |  |
| #5734 | $0.00 | INVUS15486 $150.00 | +150.00 | see Payment #PUS15340 | ? (payment via link only — amount not read) | Shopify charged $0 — compensation order invoiced at $150 |
| #5789 | $354.90 | INVUS15604 $206.90 | -148.00 | $206.90 | -148.00 |  |
| #5828 | $98.00 | INVUS15646 $42.00 | -56.00 | see Payment #PUS15503 | ? (payment via link only — amount not read) |  |
| #5851 | $166.90 | INVUS16699 $194.90 | +28.00 | $166.90 | +0.00 |  |
| #5995 | $219.00 | INVUS15829 $274.00 | +55.00 | see Payment #PUS15692 | ? (payment via link only — amount not read) |  |
| #6234 | $210.00 | INVUS16073 $105.00 | -105.00 | see Payment #PUS15932 | ? (payment via link only — amount not read) |  |
| #6256 | $585.24 | INVUS16698 $617.24 | +32.00 | see Payment #PUS16550 | ? (payment via link only — amount not read) |  |
| #6360 | $221.80 | INVUS17139 $193.80 | -28.00 | $193.80 | -28.00 |  |
| #6402 | $406.90 | INVUS16697 $524.90 | +118.00 | $406.90 | +0.00 |  |
| #6499 | $291.00 | INVUS16337 $145.50 | -145.50 | $145.50 | -145.50 |  |
| #6585 | $391.90 | INVUS16693 $524.90 | +133.00 | $391.90 | +0.00 |  |
| #6649 | $208.90 | INVUS16434 $180.90 | -28.00 | $180.90 | -28.00 |  |
| #6739 | $252.80 | INVUS17140 $224.80 | -28.00 | $224.80 | -28.00 |  |
| #6753 | $151.00 | INVUS16609 $302.00 | +151.00 | $151.00 | +0.00 |  |
| #6760 | $457.25 | INVUS16616 $805.25 | +348.00 | see Payment #PUS16476 | ? (payment via link only — amount not read) |  |
| #6773 | $150.00 | INVUS16631 $200.00 | +50.00 | see Payment #PUS16488 | ? (payment via link only — amount not read) |  |
| #6787 | $208.90 | INVUS16645 $180.90 | -28.00 | see Payment #PUS16501 | ? (payment via link only — amount not read) |  |
| #6903 | $208.90 | INVUS16778 $327.41 | +118.51 | $327.41 | +118.51 |  |
| #6991 | $218.16 | INVUS16868 $214.73 | -3.43 | see Payment #PUS16717 | ? (payment via link only — amount not read) |  |
| #7026 | $322.90 | INVUS16904 $240.90 | -82.00 | $240.90 | -82.00 |  |
| #7029 | $448.90 | INVUS16907 $428.90 | -20.00 | $428.90 | -20.00 |  |
| #7208 | $208.90 | INVUS17089 $236.90 | +28.00 | $236.90 | +28.00 |  |
| #7215 | $194.00 | INVUS17096 $97.00 | -97.00 | $97.00 | -97.00 |  |
| #7232 | $121.90 | INVUS17113 $184.90 | +63.00 | $184.90 | +63.00 |  |
| #7251 | $284.40 | INVUS17132 $269.45 | -14.95 | $269.45 | -14.95 |  |
| #7268 | $299.85 | INVUS17151 $286.85 | -13.00 | $286.85 | -13.00 |  |

Invoice overstated total: +$1319.51 · understated: -796.88 · net +522.63
Payments (where read): phantom cash +$209.51 · under-recorded -604.45

## Verified clean (dropped from the audit list — invoice == charged, refunds as CMs)
#5924, #6435, #6559, #6570, #6598, #6602, #6816
