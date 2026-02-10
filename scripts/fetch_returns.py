from __future__ import annotations

import json
from datetime import date
from pathlib import Path

import numpy as np
import pandas as pd


DAMODARAN_URL = "https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/histretSP.html"
SCHWAB_URL = "https://www.schwabmoneywise.com/investment-planning/what-is-asset-allocation"
YEARS = 50
DIVIDEND_YIELDS = {
    "VTI": 0.014,
    "VOO": 0.013,
    "QQQ": 0.006,
    "VXUS": 0.029,
    "BND": 0.037,
    "SCHD": 0.034,
    "VNQ": 0.038,
    "GLD": 0.0,
    "SLV": 0.0,
}


def clean_table(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df.columns = [str(c).strip() for c in df.columns]
    year_col = next((c for c in df.columns if c.lower() == "year"), None)
    if year_col is None:
        raise RuntimeError("Unable to find Year column in Damodaran table.")

    df = df[pd.to_numeric(df[year_col], errors="coerce").notna()].copy()
    df["Year"] = df[year_col].astype(int)
    return df


def find_col(columns: list[str], needle: str) -> str:
    lowered = needle.lower()
    for col in columns:
        if lowered in col.lower():
            return col
    raise RuntimeError(f"Unable to find column containing: {needle}")


def cagr_from_annual_returns(series_pct: pd.Series) -> float:
    returns = pd.to_numeric(series_pct, errors="coerce").dropna().to_numpy(dtype=float) / 100.0
    if len(returns) == 0:
        raise RuntimeError("No valid returns found for CAGR calculation.")
    growth = float(np.prod(1.0 + returns))
    return growth ** (1.0 / len(returns)) - 1.0


def scenario_from_profile(base_return: float, conservative_mult: float, aggressive_mult: float) -> dict[str, float]:
    return {
        "conservative": round(max(base_return * conservative_mult, 0.0), 4),
        "moderate": round(max(base_return, 0.0), 4),
        "aggressive": round(max(base_return * aggressive_mult, 0.0), 4),
    }


def main() -> None:
    table = pd.read_html(DAMODARAN_URL)[0]
    table = clean_table(table)
    end_year = int(table["Year"].max())
    start_year = end_year - YEARS + 1
    last_50 = table[table["Year"] >= start_year].copy()

    cols = list(last_50.columns)
    stock_col = find_col(cols, "S&P 500")
    small_col = find_col(cols, "Small-cap")
    bond_col = find_col(cols, "US T. Bond")
    cash_col = find_col(cols, "US T. Bill")
    real_estate_col = find_col(cols, "Real Estate")
    gold_col = find_col(cols, "Gold")

    stock = cagr_from_annual_returns(last_50[stock_col])
    small = cagr_from_annual_returns(last_50[small_col])
    bond = cagr_from_annual_returns(last_50[bond_col])
    cash = cagr_from_annual_returns(last_50[cash_col])
    real_estate = cagr_from_annual_returns(last_50[real_estate_col])
    gold = cagr_from_annual_returns(last_50[gold_col])

    conservative_portfolio = 0.20 * stock + 0.50 * bond + 0.30 * cash
    moderate_portfolio = 0.60 * stock + 0.35 * bond + 0.05 * cash
    aggressive_portfolio = 0.95 * stock + 0.00 * bond + 0.05 * cash

    conservative_mult = conservative_portfolio / moderate_portfolio
    aggressive_mult = aggressive_portfolio / moderate_portfolio

    def row(ticker: str, name: str, base: float, note: str) -> dict[str, object]:
        scenario = scenario_from_profile(base, conservative_mult, aggressive_mult)
        return {
            "ticker": ticker,
            "name": name,
            "dividend_yield": DIVIDEND_YIELDS.get(ticker, 0.0),
            **scenario,
            "baseline_50y_avg": round(base, 4),
            "proxy_note": note,
        }

    assets = [
        row("VTI", "US Total Market ETF", stock, "Proxy: US stocks (S&P 500 total return)."),
        row("VOO", "S&P 500 ETF", stock, "Proxy: US stocks (S&P 500 total return)."),
        row("QQQ", "Nasdaq-100 ETF", small, "Proxy: US small-cap stocks (long-horizon growth equity proxy)."),
        row("VXUS", "International Stocks ETF", stock, "Proxy: US stocks due consistent 50-year total-return series availability in selected source."),
        row("BND", "US Aggregate Bond ETF", bond, "Proxy: US Treasury bond return series."),
        row("SCHD", "Dividend Equity ETF", stock, "Proxy: US stocks (S&P 500 total return)."),
        row("VNQ", "US REIT ETF", real_estate, "Proxy: Damodaran real-estate return series."),
        row("GLD", "Gold ETF", gold, "Proxy: Gold return series."),
        row("SLV", "Silver ETF", gold, "Proxy: Gold return series when using this dataset."),
    ]

    payload = {
        "source_as_of": date.today().isoformat(),
        "methodology": f"50-year annualized historical averages ({start_year}-{end_year}) from Aswath Damodaran historical total returns (dividends included). Conservative/Moderate/Aggressive are scaled using Schwab allocation profiles (Conservative 20/50/30, Moderate 60/35/5, Aggressive 95/0/5 for stocks/bonds/cash).",
        "market_condition_multipliers": {
            "conservative": round(conservative_mult, 4),
            "moderate": 1.0,
            "aggressive": round(aggressive_mult, 4),
        },
        "sources": [DAMODARAN_URL, SCHWAB_URL],
        "assets": assets,
    }

    out = Path("data/assets.json")
    out.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {out} using {start_year}-{end_year} return window.")


if __name__ == "__main__":
    main()
