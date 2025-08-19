from flask import Flask, request, jsonify
import numpy as np
import pandas as pd

app = Flask(__name__)

@app.route('/calculate', methods=['POST'])
def calculate():
    print("Route /calculate aangeroepen")
    data = request.json
    prices = data['prices']
    df = pd.DataFrame(prices, columns=['price'])
    moving_average = df['price'].rolling(window=5).mean().tolist()
    return jsonify({'moving_average': moving_average})


if __name__ == '__main__':
    app.run(host='0.0.0.0', port=8000)