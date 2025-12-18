import requests
import os
import json
from datetime import datetime, date, timedelta, timezone

from team_info import team_info
from game_history import games, team_abbrev_id_map

# Constants
DATA_DIR = os.path.join("web", "data") 

# Global variables
github_actions_run = 'GITHUB_ACTIONS' in os.environ and os.environ['GITHUB_ACTIONS'] == 'true'
github_actions_scheduled_run = github_actions_run and 'GITHUB_EVENT_NAME' in os.environ and os.environ['GITHUB_EVENT_NAME'] == 'schedule'

mrda_teams = {}
mrda_events = {}
mrda_games = []

# Methods
def get_api_game_data(startDate, status=None):
    url = "https://api.mrda.org/v1-public/sanctioning/algorithm"
    params = {
        "start-date": startDate.strftime("%m/%d/%Y"),
        "end-date": (datetime.today() + timedelta(weeks=52)).strftime("%m/%d/%Y") # Include upcoming games
    }

    if status is not None:
        params["status"] = status

    response = requests.get(url, params=params)
    response.raise_for_status()  # Raises an error for bad responses

    data = response.json()
    payload = data.get('payload', [])
    
    if not data["success"]:
        print("API did not return successfully.")
        exit()

    return payload

def write_json_to_file(data, file_name, var_name=None, utc_timestamp_var=None):
    file_path = os.path.join(DATA_DIR, file_name)
    # Delete if exists
    if os.path.exists(file_path):
        os.remove(file_path)
    # Write with optional JS variable name and optional UTC timestamp variable
    with open( file_path , "w" ) as f:
        if utc_timestamp_var is not None:
            f.write(utc_timestamp_var + " = \"" + datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ") + "\";\n")    
        if var_name is not None:
            f.write(var_name + " = ")
        json.dump( data , f) #, indent=4) pretty print

def get_team_id(api_game, home_or_away):
    team_id = str(api_game["event"][f"{home_or_away}_league"])
    if api_game["event"][f"{home_or_away}_league_charter"] == "primary":
        team_id += "a"
    elif api_game["event"][f"{home_or_away}_league_charter"] == "secondary":
        team_id += "b"
    else:
        return None
    return team_id

def get_mrda_team(api_game, team_id, home_or_away):
    mrda_team = {}

    # Use nice names from team_info if present, otherwise derive from api_game
    if team_id in team_info and "name" in team_info[team_id]:
        mrda_team["name"] = team_info[team_id]["name"]
    else:
        mrda_team["name"] = api_game["event"][f"{home_or_away}_league_name"]
        if api_game["event"][f"{home_or_away}_league_charter"] == "primary":
            mrda_team["name"] += " (A)"
        elif api_game["event"][f"{home_or_away}_league_charter"] == "secondary":
            mrda_team["name"] += " (B)"
        else:
            return None

    # Get most recent logo from api_game, otherwise use backup defined in team_info
    if f"{home_or_away}_league_logo" in api_game["event"] and api_game["event"][f"{home_or_away}_league_logo"]:
        mrda_team["logo"] = api_game["event"][f"{home_or_away}_league_logo"]
    elif team_id in team_info and "logo" in team_info[team_id]:
        mrda_team["logo"] = team_info[team_id]["logo"]
    
    # Get region from team_info if present, not provided in api_game. Default to Americas
    if team_id in team_info and "region" in team_info[team_id]:
        mrda_team["region"] = team_info[team_id]["region"]
    else:
        mrda_team["region"] = "AM"

    # Location is defined in team_info, not provided in api_game
    if team_id in team_info and "location" in team_info[team_id]:
        mrda_team["location"] = team_info[team_id]["location"]

    return mrda_team

# Get 2024+ games from API
print("Begin MRDA Central API game data retrieval...")
game_data = get_api_game_data(date(2024, 1, 1))
print("Retrieved " + str(len(game_data)) + " games from >=2024 in Pending Processing or Complete status")

approved_game_data = get_api_game_data(date(2024, 1, 1), 3)
print("Retrieved " + str(len(approved_game_data)) + " games in Approved status")
game_data.extend(approved_game_data)

#waiting_for_documents_game_data = get_api_game_data(datetime.today() - timedelta(days=45), 4)
#print("Retrieved " + str(len(waiting_for_documents_game_data)) + " games from last 45 days in Waiting for Documents status")
waiting_for_documents_game_data = get_api_game_data(date(2024, 1, 1), 4)
print("Retrieved " + str(len(waiting_for_documents_game_data)) + " games in Waiting for Documents status")
game_data.extend(waiting_for_documents_game_data)

# Compare game_data to JSON file from last calculation for scheduled runs.
# Only recalculate rankings if game_data changes (manual runs always recalculate).
game_data_json_filename = "mrda_api_data.json"
game_data_json_file_path = os.path.join(DATA_DIR, game_data_json_filename)
if github_actions_scheduled_run:
    if os.path.exists(game_data_json_file_path):
        with open( game_data_json_file_path , "r" ) as f:
            file_content = f.read()
            if file_content == json.dumps(game_data):
                # game_data has not changed, exit without recalculating rankings
                print("Game data from MRDA Central API has not changed, exiting without recalculating rankings.")
                exit()

print("Initializing MRDA games list...")                
# Save game_data to JSON file for future comparison.
write_json_to_file(game_data, game_data_json_filename)
print(f"MRDA Central API game_data saved to {game_data_json_file_path} for future comparison.")

# Add 2023 events and games from game_history.py to mrda_events and mrda_games
for game_day in games:
    # Derive negative event_id so we don't collide with event_id from API
    event_id = games.index(game_day) - len(games)
    event = {
        "start_dt": datetime.strptime(game_day[0][0], "%Y-%m-%d")
    }
    if len(game_day[0]) > 5:
        event["name"] = game_day[0][5]
    mrda_events[event_id] = event

    for game in game_day:
        mrda_game = {
            "date": datetime.strptime(game[0], "%Y-%m-%d"),
            "home_team_id": team_abbrev_id_map[game[1]],
            "home_team_score": game[2],
            "away_team_id": team_abbrev_id_map[game[3]],
            "away_team_score": game[4],
            "event_id": event_id,
            "status": 7
        }

        # Add end_dt if multi-day event
        if mrda_game["date"].date() > event["start_dt"].date() and ("end_dt" not in event or mrda_game["date"] > event["end_dt"]):
            event["end_dt"] = mrda_game["date"]

        # Forfeits are hardcoded in game_history.py as 100-0 score
        if (mrda_game["home_team_score"] == 0 and mrda_game["away_team_score"] == 100) or (mrda_game["home_team_score"] == 100 and mrda_game["away_team_score"] == 0):
            mrda_game["forfeit"] = True
            if mrda_game["home_team_score"] == 0 and mrda_game["away_team_score"] == 100:
                mrda_game["forfeit_team_id"] = mrda_game["home_team_id"]
            elif mrda_game["away_team_score"] == 0 and mrda_game["home_team_score"] == 100:
                mrda_game["forfeit_team_id"] = mrda_game["away_team_id"]

        mrda_games.append(mrda_game)

print("Added " + str(len(mrda_games)) + " games from 2023 in game_history.py")

# Validate and add data from API to mrda_events, mrda_teams and mrda_games
sorted_game_data = sorted(game_data, key=lambda x: datetime.strptime(x["event"]["game_datetime"], "%Y-%m-%d %H:%M:%S"))
for api_game in sorted_game_data:
    # Required fields
    if "event" not in api_game or api_game["event"] is None:
        print(f"event not found at index {sorted_game_data.index(api_game)}")
        continue
    if "game_datetime" not in api_game["event"] or api_game["event"]["game_datetime"] is None:
        print(f"game_datetime not found, sanctioning_events_id: {api_game["event"]["sanctioning_events_id"]}")
        continue
    if "forfeit" in api_game["event"] and api_game["event"]["forfeit"] == 1 and ("forfeit_league" not in api_game["event"] or api_game["event"]["forfeit_league"] is None):
        print(f"forfeit_league not found where forfeit == 1, sanctioning_events_id: {api_game["event"]["sanctioning_events_id"]}")
        continue

    valid = True
    for home_or_away in ["home","away"]:
        if f"{home_or_away}_league" not in api_game["event"] or api_game["event"][f"{home_or_away}_league"] is None:
            print(f"{home_or_away}_league not found, sanctioning_events_id: {api_game["event"]["sanctioning_events_id"]}")
            valid = False
        if f"{home_or_away}_league_charter" not in api_game["event"] or api_game["event"][f"{home_or_away}_league_charter"] is None or api_game["event"][f"{home_or_away}_league_charter"] not in ["primary","secondary"]:
            print(f"{home_or_away}_league_charter is not primary or secondary, sanctioning_events_id: {api_game["event"]["sanctioning_events_id"]}")
            valid = False
    if not valid:
        continue

    game_dt = datetime.strptime(api_game["event"]["game_datetime"], "%Y-%m-%d %H:%M:%S")
    
    # Scores are not required as they're used by the upcoming games predictor
    has_score = True
    for home_or_away in ["home","away"]:
        if f"{home_or_away}_league_score" not in api_game["event"] or api_game["event"][f"{home_or_away}_league_score"] is None:
            has_score = False

    # Filter out games without scores older than 45 days
    if not has_score and game_dt < (datetime.today() - timedelta(days=45)):
        continue

    # Map API data
    game = {
        "date": game_dt,
        "status": api_game["event"]["status"]
    }

    # Team IDs
    for home_or_away in ["home","away"]:
        team_id = get_team_id(api_game, home_or_away)
        game[f"{home_or_away}_team_id"] = team_id
        
        # Add teams to mrda_teams
        if team_id not in mrda_teams:
            mrda_teams[team_id] = get_mrda_team(api_game, team_id, home_or_away)

    # Scores
    if has_score:
        game["home_team_score"] = api_game["event"]["home_league_score"]
        game["away_team_score"] = api_game["event"]["away_league_score"]

    # Forfeits
    if "forfeit" in api_game["event"] and api_game["event"]["forfeit"] == 1:
        game["forfeit"] = True
        if "forfeit_league" in api_game["event"] and api_game["event"]["forfeit_league"] is not None:
            if api_game["event"]["forfeit_league"] == api_game["event"]["home_league"]:
                game["forfeit_team_id"] = game["home_team_id"]
            elif api_game["event"]["forfeit_league"] == api_game["event"]["away_league"]:
                game["forfeit_team_id"] = game["away_team_id"]
            else:
                print(f"forfeit_league for forfeit did not match home_league or away_league, sanctioning_events_id: {api_game["event"]["sanctioning_events_id"]}")
        else:
            print(f"forfeit_league not found for forfeit, sanctioning_events_id: {api_game["event"]["sanctioning_events_id"]}")
        # Calculate forfeit_team_id based on score if we don't have it
        if "forfeit_team_id" not in game:
            if game["home_team_score"] < game["away_team_score"]:
                game["forfeit_team_id"] = game["home_team_id"]
            elif game["home_team_score"] > game["away_team_score"]:
                game["forfeit_team_id"] = game["away_team_id"]
            else:
                print(f"forfeit_league could not be determined for forfeit, sanctioning_events_id: {api_game["event"]["sanctioning_events_id"]}")

    # Event
    if "sanctioning_id" in api_game["event"] and api_game["event"]["sanctioning_id"] is not None:
        game["event_id"] = api_game["event"]["sanctioning_id"]

        # Add event to mrda_events
        if game["event_id"] not in mrda_events:
            event = {
                "start_dt": game_dt
            }
            if "sanctioning" in api_game and "event_name" in api_game["sanctioning"] and api_game["sanctioning"]["event_name"] is not None:
                event["name"] = api_game["sanctioning"]["event_name"]
            mrda_events[game["event_id"]] = event
        # Set or update end_dt for multi-day events if newer 
        elif game_dt.date() > mrda_events[game["event_id"]]["start_dt"].date() and ("end_dt" not in mrda_events[game["event_id"]] or game_dt > mrda_events[game["event_id"]]["end_dt"]):
            mrda_events[api_game["event"]["sanctioning_id"]]["end_dt"] = game_dt

    mrda_games.append(game)

# Save mrda_events JSON to JavaScript file for local web UI, format dates first
for event_id in mrda_events.keys():
    mrda_events[event_id]["start_dt"] = '{d.year}-{d.month}-{d.day} {d.hour}:{d.minute:02}'.format(d=mrda_events[event_id]["start_dt"])
    if "end_dt" in mrda_events[event_id]:
        mrda_events[event_id]["end_dt"] = '{d.year}-{d.month}-{d.day} {d.hour}:{d.minute:02}'.format(d=mrda_events[event_id]["end_dt"])
write_json_to_file(mrda_events, "mrda_events.js", "mrda_events")
# Save mrda_events JSON file for external use
write_json_to_file(mrda_events, "mrda_events.json")
print("MRDA events saved to mrda_events.js and mrda_events.json")

# Save mrda_teams JSON to JavaScript file for local web UI
write_json_to_file(mrda_teams, "mrda_teams.js", "mrda_teams")
# Save mrda_teams JSON file for external use
write_json_to_file(mrda_teams, "mrda_teams.json")
print("MRDA teams saved to mrda_teams.js and mrda_teams.json")

# Feature to remove games for excluded teams
#excludedTeams = ["2714a", "17916a", "17915a","17910a","17911a"] #PAN, ORD, RDNA, NDT, RDT
#mrda_games = [game for game in mrda_games if not game["home_team_id"] in excludedTeams and not game["away_team_id"] in excludedTeams]

# Feature to get results for a specific event.
#mrda_games = [game for game in mrda_games if game["event_name"] == "2025 Mens Roller Derby Association Championships"]

# Feature to exclude new games to look at changes from game decay only.
# mrda_games = [game for game in mrda_games if game["date"] <= datetime(2025,10,8)]