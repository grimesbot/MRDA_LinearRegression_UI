import math
from datetime import datetime, timedelta
from tkinter import Tk

from game_history import team_abbrev_id_map
from mrda_game import MrdaGame
from linear_regression import get_ranking_history, get_rankings, RANKING_SCALE, mrda_games, mrda_teams

game_count = 0
error_sum = 0
for game in [game for game in mrda_games if game.scores_submitted and not game.forfeit]:
    ranking = get_ranking_history(game.datetime.date())
    if ranking is not None and game.home_team in ranking and game.away_team in ranking: 
        predicted_ratio = ranking[game.home_team].ranking_points/ranking[game.away_team].ranking_points
        actual_ratio = game.home_score/game.away_score
        error_sum += abs(math.log(predicted_ratio/actual_ratio))
        game_count += 1

table_str = f"Mean Absolute Log Error: {str(round((math.exp(error_sum/game_count) - 1) * 100,2))}%\n\n"

#('2023-05-06', 'KMRD', 81, 'TIL', 197)
# Hypothetical game analysis
home_abbrev = "DHR"
away_abbrev = "KMRD"
game_date = '2025-12-6' #No other games on this week in history, isolated results

game_dt = datetime.strptime(game_date, "%Y-%m-%d")
home_id = team_abbrev_id_map[home_abbrev] 
away_id = team_abbrev_id_map[away_abbrev]

current_ranking = get_ranking_history(game_dt.date())
home_rp = current_ranking[home_id].ranking_points * RANKING_SCALE
away_rp = current_ranking[away_id].ranking_points * RANKING_SCALE
table_str += f"Hypothetical game between {mrda_teams[home_id].name} vs. {mrda_teams[away_id].name} on {game_date}. Expected score ratio: {str(round(home_rp/away_rp,2))}\n\n"
table_str += f"Ratio\t{mrda_teams[home_id].name} RP Δ\t{mrda_teams[away_id].name} RP Δ\tWeight\n"

for score_ratio in range(2, 31):
    mock_game_history = (game_date, home_abbrev, score_ratio, away_abbrev, 1)
    mock_game = MrdaGame(None, mock_game_history)
    mrda_games.append(mock_game)
    new_ranking = get_rankings((game_dt + timedelta(weeks=1)).date())
    new_home_rp = new_ranking[home_id].ranking_points * RANKING_SCALE
    new_away_rp = new_ranking[away_id].ranking_points * RANKING_SCALE
    table_str += f"{score_ratio}\t{str(round(new_home_rp - home_rp,2))}\t{str(round(new_away_rp - away_rp,2))}\t{mock_game.weight}\n"
    mrda_games.remove(mock_game)

# Copy to clipboard using tkinter
r = Tk()
r.withdraw()
r.clipboard_clear()
r.clipboard_append(table_str)
r.update()
r.destroy()