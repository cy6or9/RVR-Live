#!/bin/bash
# Add forecast caching useEffect to river-conditions.js

FILE="src/pages/river-conditions.js"

# Check if already added
if grep -q "updateCachedForecast(predictionSeries)" "$FILE"; then
  echo "✓ Forecast caching effect already exists"
  exit 0
fi

# Find line number where we need to insert
LINE_NUM=$(grep -n "const predictionSeries = normalizeForecastSeries" "$FILE" | cut -d: -f1)

if [ -z "$LINE_NUM" ]; then
  echo "ERROR: Could not find predictionSeries line"
  exit 1
fi

# Calculate insertion point (after predictionSeries + blank line)
INSERT_LINE=$((LINE_NUM + 2))

# Create the code to insert
cat > /tmp/forecast-effect.txt << 'EOF'
  // Update cached forecast when prediction data changes
  useEffect(() => {
    if (updateCachedForecast && predictionSeries && predictionSeries.length > 0) {
      updateCachedForecast(predictionSeries);
    }
  }, [predictionSeries, updateCachedForecast]);

EOF

# Insert the code
sed -i "${INSERT_LINE}r /tmp/forecast-effect.txt" "$FILE"

echo "✓ Added forecast caching useEffect hook at line $INSERT_LINE"
