from datetime import datetime, timedelta
from tkinter import Tk

from linear_regression import get_ranking_history, get_rankings, scored_games, mrda_teams

game_count = 0
error_sum = 0
for game in [game for game in scored_games if "forfeit" not in game or not game["forfeit"]]:
    ranking = get_ranking_history(game["date"].date())
    if ranking is not None and game["home_team_id"] in ranking and game["away_team_id"] in ranking: 
        predicted_diff = ranking[game["home_team_id"]]["rp"] - ranking[game["away_team_id"]]["rp"]
        actual_diff = game["home_team_score"] - game["away_team_score"]
        error_sum += abs(predicted_diff - actual_diff)
        game_count += 1

table_str = f"Average Error: {error_sum/game_count}\n\n"

# Hypothetical game analysis
home_id = "17404a" #DRH
away_id = "13122a" #Kent
game_dt = datetime(2025, 12, 6) #No other games on this week in history, isolated results

#home_id = "17916a" #Orcet
#away_id = "2719a" #Race City
#game_dt = datetime(2025, 12, 6)
        
#home_id = "2699a" #Concussion 
#away_id = Kent #"2735a" #Toronto 
#game_dt = datetime(2026, 2, 14) #Rainy City Rumble

current_ranking = get_ranking_history(game_dt.date())
home_rp = current_ranking[home_id]["rp"]
away_rp = current_ranking[away_id]["rp"]
table_str += f"Hypothetical game between {mrda_teams[home_id]["name"]} vs. {mrda_teams[away_id]["name"]} on {'{d.year}-{d.month}-{d.day}'.format(d=game_dt)}. Expected score differential: {str(round(home_rp-away_rp,2))}\n\n"
table_str += f"Diff\t{mrda_teams[home_id]["name"]} RP Δ\t{mrda_teams[away_id]["name"]} RP Δ\tWeight\n"

for score_differential in range(25, 801, 25):
    hypothetical_game = {
            "date": game_dt,
            "home_team_id": home_id, 
            "home_team_score": score_differential,
            "away_team_id": away_id,
            "away_team_score": 0
        }
    scored_games.append(hypothetical_game)
    new_ranking = get_rankings((game_dt + timedelta(weeks=1)).date())
    new_home_rp = new_ranking[home_id]["rp"]
    new_away_rp = new_ranking[away_id]["rp"]
    table_str += f"{score_differential}\t{str(round(new_home_rp - home_rp,2))}\t{str(round(new_away_rp - away_rp,2))}\t{hypothetical_game["weight"]}\n"
    scored_games.remove(hypothetical_game)

# Copy to clipboard using tkinter
r = Tk()
r.withdraw()
r.clipboard_clear()
r.clipboard_append(table_str)
r.update()
r.destroy()