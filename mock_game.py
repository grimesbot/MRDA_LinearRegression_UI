import math
from datetime import datetime, timedelta
from tkinter import Tk

from linear_regression import get_ranking_history, get_rankings, RANKING_SCALE, scored_games, mrda_teams

game_count = 0
error_sum = 0
for game in [game for game in scored_games if "forfeit" not in game or not game["forfeit"]]:
    ranking = get_ranking_history(game["date"].date())
    if ranking is not None and game["home_team_id"] in ranking and game["away_team_id"] in ranking: 
        predicted_ratio = ranking[game["home_team_id"]]["rp"]/ranking[game["away_team_id"]]["rp"]
        actual_ratio = game["home_team_score"]/game["away_team_score"]
        error_sum += abs(math.log(predicted_ratio/actual_ratio))
        game_count += 1

table_str = f"Mean Absolute Log Error: {str(round((math.exp(error_sum/game_count) - 1) * 100,2))}%\n\n"

# Hypothetical game analysis
home_id = "17404a" #DRH
away_id = "13122a" #Kent
game_dt = datetime(2025, 12, 6) #No other games on this week in history, isolated results

#home_id = "2699a" #Concussion 
#away_id = Kent #"2735a" #Toronto 
#game_dt = datetime(2026, 2, 14) #Rainy City Rumble

current_ranking = get_ranking_history(game_dt.date())
home_rp = current_ranking[home_id]["rp"] * RANKING_SCALE
away_rp = current_ranking[away_id]["rp"] * RANKING_SCALE
table_str += f"Hypothetical game between {mrda_teams[home_id]["name"]} vs. {mrda_teams[away_id]["name"]} on {'{d.year}-{d.month}-{d.day}'.format(d=game_dt)}. Expected score ratio: {str(round(home_rp/away_rp,2))}\n\n"
table_str += f"Ratio\t{mrda_teams[home_id]["name"]} RP Δ\t{mrda_teams[away_id]["name"]} RP Δ\tWeight\n"

for score_ratio in range(2, 31):
    hypothetical_game = {
            "date": game_dt,
            "home_team_id": home_id, 
            "home_team_score": score_ratio,
            "away_team_id": away_id,
            "away_team_score": 1
        }
    scored_games.append(hypothetical_game)
    new_ranking = get_rankings((game_dt + timedelta(weeks=1)).date())
    new_home_rp = new_ranking[home_id]["rp"] * RANKING_SCALE
    new_away_rp = new_ranking[away_id]["rp"] * RANKING_SCALE
    table_str += f"{score_ratio}\t{str(round(new_home_rp - home_rp,2))}\t{str(round(new_away_rp - away_rp,2))}\t{hypothetical_game["weight"]}\n"
    scored_games.remove(hypothetical_game)

# Copy to clipboard using tkinter
r = Tk()
r.withdraw()
r.clipboard_clear()
r.clipboard_append(table_str)
r.update()
r.destroy()