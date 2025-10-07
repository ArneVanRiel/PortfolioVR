ALTER TABLE stock_calculations
ADD
    ltd_equity_mean DECIMAL(18, 4),
    latest_fcf_yearly_ttm DECIMAL(24, 4),
    dcf_sum DECIMAL(24, 4),
    discounted_terminal_value DECIMAL(24, 4),
    total_value DECIMAL(24, 4),
    latest_shares_outstanding DECIMAL(24, 4);
