import pandas as pd
from python_files.changeDataToDatabaseFromSec import GetSec

# Create a sample DataFrame
data = {'name': ['Alice', 'Bob', 'Charlie'],
        'age': [25, 30, 22]}
df = pd.DataFrame(data)
df1 = GetSec("ADBE")
print(df1)
# Convert DataFrame to JSON (records format)
json_data = df1.to_json(orient='records')

# Print the JSON data
print(json_data)