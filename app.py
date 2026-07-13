# ----------------------------------------------------
# ScanVibe - QR & Barcode Scanner App Backend (Flask)
# College Mini-Project - SQLite Database Interface
# ----------------------------------------------------

import os
import sqlite3
from flask import Flask, render_template, request, jsonify, g, redirect, url_for

# 1. Initialize the Flask Application
app = Flask(__name__)

# 2. Database File Configuration
# Configures the SQLite database file path. app.root_path places it directly in the project folder.
DATABASE = os.path.join(app.root_path, 'database.db')

def get_db():
    """
    Opens a new database connection if there is none yet for the current application context.
    Using Flask's 'g' object ensures database connections are reusable across requests and safely closed.
    """
    db = getattr(g, '_database', None)
    if db is None:
        # Establish connection with the SQLite database file
        db = g._database = sqlite3.connect(DATABASE)
        # Enable dictionary-like row access (allows accessing columns using row['column_name'] instead of index)
        db.row_factory = sqlite3.Row
    return db

@app.teardown_appcontext
def close_connection(exception):
    """
    Closes the SQLite database connection automatically at the end of every web request.
    This prevents database lock errors.
    """
    db = getattr(g, '_database', None)
    if db is not None:
        db.close()

def init_db():
    """
    Initializes the database schema by creating the 'scan_history' table if it doesn't already exist.
    This function runs once when the Flask server starts.
    """
    with app.app_context():
        db = get_db()
        cursor = db.cursor()
        # Execute query to create scan_history table
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS scan_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                barcode_type TEXT NOT NULL,
                barcode_value TEXT NOT NULL,
                scan_date TEXT NOT NULL,
                scan_time TEXT NOT NULL
            )
        ''')
        db.commit()

# Run table initialization on startup
init_db()

# ----------------------------------------------------
# Web Route Handlers (HTML Renderers)
# ----------------------------------------------------

@app.route('/')
def index():
    """
    Renders and serves the main homepage dashboard template (index.html).
    This contains the live scanner layout.
    """
    return render_template('index.html')

@app.route('/history')
def history():
    """
    Renders the scan history page displaying saved scans.
    Supports search filters via 'q' GET URL parameter (e.g. /history?q=QR_CODE).
    """
    # Extract search keyword from query parameter (removes leading/trailing whitespaces)
    q = request.args.get('q', '').strip()
    db = get_db()
    cursor = db.cursor()
    
    if q:
        # Perform SQL search using LIKE wildcard matching on barcode_value or barcode_type columns
        # CASE-INSENSITIVE matches are handled natively by SQLite LIKE
        cursor.execute('''
            SELECT * FROM scan_history 
            WHERE barcode_value LIKE ? OR barcode_type LIKE ? 
            ORDER BY id DESC
        ''', (f'%{q}%', f'%{q}%'))
    else:
        # No search filter: Retrieve all recorded scans sorted by newest first
        cursor.execute('SELECT * FROM scan_history ORDER BY id DESC')
        
    scans = cursor.fetchall()
    # Serve history template page with search results and the query keyword
    return render_template('history.html', scans=scans, search_query=q)

@app.route('/delete/<int:scan_id>')
def delete_scan_route(scan_id):
    """
    Deletes a single scan entry by ID and redirects the browser back to the history list page.
    This eliminates complex JavaScript code from the history page.
    """
    db = get_db()
    cursor = db.cursor()
    # Delete query targeting scan entry
    cursor.execute('DELETE FROM scan_history WHERE id = ?', (scan_id,))
    db.commit()
    # Redirect client browser back to /history, refreshing the page automatically
    return redirect(url_for('history'))

@app.route('/clear-history')
def clear_history_route():
    """
    Deletes all scans from database and redirects the browser back to the history page.
    """
    db = get_db()
    cursor = db.cursor()
    # Wipe scans table clean
    cursor.execute('DELETE FROM scan_history')
    db.commit()
    return redirect(url_for('history'))

# ----------------------------------------------------
# API Endpoint Route Handlers (JSON REST APIs)
# ----------------------------------------------------

@app.route('/api/scans', methods=['GET', 'POST', 'DELETE'])
def manage_scans():
    """
    REST API endpoint for managing scan logs. Used by JavaScript fetch calls.
    - GET: Retrieves JSON array of scan records.
    - POST: Appends a new scanned code to the SQLite database.
    - DELETE: Clears all logs (backup path).
    """
    db = get_db()
    cursor = db.cursor()

    if request.method == 'GET':
        cursor.execute('SELECT * FROM scan_history ORDER BY id DESC')
        rows = cursor.fetchall()
        
        # Parse sqlite3 Row entries to dynamic list array
        scans = []
        for row in rows:
            scans.append({
                'id': row['id'],
                'barcode_value': row['barcode_value'],
                'barcode_type': row['barcode_type'],
                'scan_date': row['scan_date'],
                'scan_time': row['scan_time']
            })
        return jsonify(scans)

    elif request.method == 'POST':
        # Retrieve JSON parameters from POST request payload
        data = request.get_json()
        if not data or 'barcode_value' not in data or 'barcode_type' not in data:
            return jsonify({'error': 'Missing barcode/QR code data'}), 400

        barcode_value = data['barcode_value']
        barcode_type = data['barcode_type']

        # Determine current server local date and time values
        from datetime import datetime
        now = datetime.now()
        scan_date = now.strftime('%Y-%m-%d')
        scan_time = now.strftime('%H:%M:%S')

        # Insert scan values into database scan_history table
        cursor.execute(
            'INSERT INTO scan_history (barcode_value, barcode_type, scan_date, scan_time) VALUES (?, ?, ?, ?)',
            (barcode_value, barcode_type, scan_date, scan_time)
        )
        db.commit()

        # Respond with HTTP 201 Created and JSON description
        return jsonify({
            'success': True,
            'message': 'Scan entry added.',
            'scan': {
                'id': cursor.lastrowid,
                'barcode_value': barcode_value,
                'barcode_type': barcode_type,
                'scan_date': scan_date,
                'scan_time': scan_time
            }
        }), 201

    elif request.method == 'DELETE':
        cursor.execute('DELETE FROM scan_history')
        db.commit()
        return jsonify({'success': True, 'message': 'All scan records cleared.'})

# ----------------------------------------------------
# Main execution block
# ----------------------------------------------------
if __name__ == '__main__':
    # Start local Python development web server. Runs in Debug Mode.
    app.run(debug=True, port=5000)
