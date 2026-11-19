# FROSE Street — Unified Settings (Design 3: Vertical Accordion Drawer) Report

## Executive Summary
This update implements **Design 3: Vertical Accordion Drawer (Square POS Style)** for the FROSE Street POS and Counter platform. The unified settings drawer enables stall owners to update their profile, upload a custom payment scanner image, change their UPI VPA ID, adjust dish prices and stock availability on the fly, and configure Billing, Kitchen (KDS), and Packaging preferences.

## Acceptance Criteria Matrix
| Criterion | Status | Details |
| :--- | :--- | :--- |
| **Design Selection Parity** | PASS | Exact visual parity with approved Design 3 (Quick action bar, accordion sections). |
| **Profile Updates** | PASS | Edits business name, owner name, address; persists to `frose_current_vendor`. |
| **Scanner QR Upload & UPI** | PASS | Uploads custom QR image via `FileReader`, binds UPI VPA ID and payee name. |
| **Dishes & Quick Stock** | PASS | Live price editor and in-stock/sold-out toggles with instant saving. |
| **Subsystems Configuration** | PASS | GST rate (0%/5%/18%), 58mm printer, KDS KOT chime sound, token reset mode. |
| **Offline Cache & PWA** | PASS | Precached in `sw.js` (cache `v10`), works 100% offline. |

## Verdict
**PASS**
