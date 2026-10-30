import { useState, type FormEvent } from "react";
import { Dices, Plus, Shield, SkipForward, Swords, Trash2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetRoomCombatQueryKey,
  useAddCombatant,
  useGetRoomCombat,
  useRemoveCombatant,
  useRequestAttack,
  useUpdateCombatantInitiative,
  useUpdateRoomCombat,
} from "@workspace/api-client-react";

type RoomPlayer = { id: string; characterName: string };

type CombatPanelProps = {
  code: string;
  players: RoomPlayer[];
  playerName: string;
  isDm: boolean;
};

function CombatPanel({ code, players, playerName, isDm }: CombatPanelProps) {
  const queryClient = useQueryClient();
  const combatQuery = useGetRoomCombat(code, {
    query: {
      queryKey: getGetRoomCombatQueryKey(code),
      refetchInterval: 2500,
      enabled: isDm || Boolean(playerName),
    },
  });
  const updateCombat = useUpdateRoomCombat();
  const addCombatant = useAddCombatant();
  const updateInitiative = useUpdateCombatantInitiative();
  const removeCombatant = useRemoveCombatant();
  const requestAttack = useRequestAttack();

  const [enemyName, setEnemyName] = useState("");
  const [enemyInitiative, setEnemyInitiative] = useState("0");
  const [attackTarget, setAttackTarget] = useState("");
  const [dexterityScore, setDexterityScore] = useState("10");
  const [initiativeDrafts, setInitiativeDrafts] = useState<Record<string, string>>({});
  const [showAttackForm, setShowAttackForm] = useState(false);
  const [error, setError] = useState("");

  const combat = combatQuery.data;
  const activeCombatant = combat?.combatants.find(
    (combatant) => combatant.id === combat.activeCombatantId,
  );
  const ownCombatant = combat?.combatants.find(
    (combatant) =>
      combatant.kind === "player" && combatant.name === playerName,
  );
  const isMyTurn = Boolean(
    combat?.active && ownCombatant && activeCombatant?.id === ownCombatant.id,
  );

  const refreshCombat = () =>
    queryClient.invalidateQueries({
      queryKey: getGetRoomCombatQueryKey(code),
    });

  const runAction = (action: "start" | "advance" | "end") => {
    setError("");
    updateCombat.mutate(
      { code, data: { action } },
      {
        onSuccess: refreshCombat,
        onError: () =>
          setError("That combat action couldn't be completed. Try again."),
      },
    );
  };

  const addEnemy = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = enemyName.trim();
    const initiative = Number(enemyInitiative);
    if (!name || !Number.isInteger(initiative) || initiative < -5 || initiative > 50) {
      setError("Enter an enemy name and an initiative from -5 to 50.");
      return;
    }
    setError("");
    addCombatant.mutate(
      { code, data: { name, initiative } },
      {
        onSuccess: () => {
          setEnemyName("");
          setEnemyInitiative("0");
          void refreshCombat();
        },
        onError: () => setError("The enemy couldn't be added. Try again."),
      },
    );
  };

  const saveInitiative = (combatantId: string, currentValue: number) => {
    const rawValue = initiativeDrafts[combatantId];
    if (rawValue === undefined) return;
    const initiative = Number(rawValue);
    if (!Number.isInteger(initiative) || initiative < -5 || initiative > 50) {
      setError("Initiative must be a whole number from -5 to 50.");
      setInitiativeDrafts((drafts) => {
        const next = { ...drafts };
        delete next[combatantId];
        return next;
      });
      return;
    }
    if (initiative === currentValue) {
      setInitiativeDrafts((drafts) => {
        const next = { ...drafts };
        delete next[combatantId];
        return next;
      });
      return;
    }
    setError("");
    updateInitiative.mutate(
      { code, combatantId, data: { initiative } },
      {
        onSuccess: () => {
          setInitiativeDrafts((drafts) => {
            const next = { ...drafts };
            delete next[combatantId];
            return next;
          });
          void refreshCombat();
        },
        onError: () => setError("Initiative couldn't be updated. Try again."),
      },
    );
  };

  const deleteCombatant = (combatantId: string) => {
    setError("");
    removeCombatant.mutate(
      { code, combatantId },
      {
        onSuccess: refreshCombat,
        onError: () => setError("The combatant couldn't be removed. Try again."),
      },
    );
  };

  const submitAttack = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const score = Number(dexterityScore);
    if (
      !attackTarget.trim() ||
      !Number.isInteger(score) ||
      score < 1 ||
      score > 30
    ) {
      setError("Enter a target and a Dexterity score from 1 to 30.");
      return;
    }
    setError("");
    requestAttack.mutate(
      {
        code,
        data: { targetName: attackTarget.trim(), dexterityScore: score },
      },
      {
        onSuccess: () => {
          setShowAttackForm(false);
          setAttackTarget("");
          void refreshCombat();
        },
        onError: () =>
          setError("Your attack couldn't be rolled. Check that it is still your turn."),
      },
    );
  };

  return (
    <section className="combat-panel" aria-label="Combat tools">
      <div className="panel-header">
        <div>
          <span className="section-kicker">THE ENCOUNTER</span>
          <h2>Combat <span className="combat-round-label">{combat?.active ? `ROUND ${combat.round}` : "READY"}</span></h2>
        </div>
        <Swords size={18} />
      </div>

      {combatQuery.isLoading ? (
        <p className="combat-hint">Preparing the encounter…</p>
      ) : combatQuery.isError || !combat ? (
        <p className="combat-hint">Join the room to see combat details.</p>
      ) : (
        <>
          {isDm ? (
            <div className="combat-dm-controls">
              {combat.active ? (
                <>
                  <p className="combat-current-turn">
                    <span className="combat-turn-dot" />
                    {activeCombatant
                      ? `${activeCombatant.name}'s turn`
                      : "Add a combatant to begin turns"}
                  </p>
                  <div className="combat-action-row">
                    <button
                      className="button button-primary combat-action-button"
                      onClick={() => runAction("advance")}
                      disabled={updateCombat.isPending || combat.combatants.length === 0}
                    >
                      <SkipForward size={14} /> Next turn
                    </button>
                    <button
                      className="button button-quiet combat-action-button"
                      onClick={() => runAction("end")}
                      disabled={updateCombat.isPending}
                    >
                      End combat
                    </button>
                  </div>
                </>
              ) : (
                <button
                  className="button button-primary combat-action-button"
                  onClick={() => runAction("start")}
                  disabled={updateCombat.isPending}
                >
                  <Swords size={14} /> {updateCombat.isPending ? "Starting…" : "Start combat"}
                </button>
              )}

              <form className="combat-enemy-form" onSubmit={addEnemy}>
                <label htmlFor={`enemy-name-${code}`}>ADD ENEMY</label>
                <div className="combat-enemy-fields">
                  <input
                    id={`enemy-name-${code}`}
                    value={enemyName}
                    onChange={(event) => setEnemyName(event.target.value)}
                    placeholder="Enemy name"
                    maxLength={40}
                    aria-label="Enemy name"
                  />
                  <input
                    type="number"
                    min={-5}
                    max={50}
                    step={1}
                    value={enemyInitiative}
                    onChange={(event) => setEnemyInitiative(event.target.value)}
                    aria-label="Enemy initiative"
                    title="Enemy initiative"
                  />
                  <button
                    type="submit"
                    className="combat-icon-button"
                    aria-label="Add enemy"
                    title="Add enemy"
                    disabled={addCombatant.isPending}
                  >
                    <Plus size={15} />
                  </button>
                </div>
              </form>
            </div>
          ) : combat.active ? (
            <div className="combat-player-status">
              <p className="combat-current-turn">
                <span className="combat-turn-dot" />
                {activeCombatant
                  ? `${activeCombatant.name}'s turn`
                  : "The DM is setting up the turn order"}
              </p>
              {playerName ? (
                isMyTurn ? (
                  <button
                    className="button button-primary combat-action-button"
                    onClick={() => {
                      setError("");
                      setShowAttackForm((visible) => !visible);
                    }}
                  >
                    <Dices size={15} /> Request an attack
                  </button>
                ) : (
                  <p className="combat-hint">
                    {activeCombatant
                      ? `Your turn begins after ${activeCombatant.name}.`
                      : "Waiting for the DM to set the turn order."}
                  </p>
                )
              ) : (
                <p className="combat-hint">Join as a character to take a turn.</p>
              )}
            </div>
          ) : (
            <p className="combat-hint">
              {isDm
                ? "Start combat when the party is ready."
                : "The DM hasn't started combat yet."}
            </p>
          )}

          {showAttackForm && isMyTurn && (
            <form className="combat-attack-form" onSubmit={submitAttack}>
              <label htmlFor={`attack-target-${code}`}>TARGET</label>
              <input
                id={`attack-target-${code}`}
                value={attackTarget}
                onChange={(event) => setAttackTarget(event.target.value)}
                placeholder="e.g. Goblin"
                maxLength={60}
                required
              />
              <label htmlFor={`dexterity-score-${code}`}>DEXTERITY SCORE</label>
              <input
                id={`dexterity-score-${code}`}
                type="number"
                min={1}
                max={30}
                step={1}
                value={dexterityScore}
                onChange={(event) => setDexterityScore(event.target.value)}
                required
              />
              <p className="combat-hint">
                Your DEX score is converted to its modifier. The DM decides the outcome.
              </p>
              <button
                className="button button-primary combat-action-button"
                disabled={requestAttack.isPending}
              >
                <Dices size={15} />
                {requestAttack.isPending ? "Rolling…" : "Roll d20 + DEX"}
              </button>
            </form>
          )}

          {combat.combatants.length > 0 && (
            <div className="combat-turn-order">
              <div className="combat-subheading">
                <Shield size={13} /> TURN ORDER
              </div>
              {combat.combatants.map((combatant, index) => {
                const isActive = combat.active && combatant.id === combat.activeCombatantId;
                const value = initiativeDrafts[combatant.id] ?? String(combatant.initiative);
                return (
                  <div
                    className={`combatant-row${isActive ? " combatant-active" : ""}`}
                    key={combatant.id}
                  >
                    <span className="combatant-order">{index + 1}</span>
                    <div className="combatant-name">
                      <strong>{combatant.name}</strong>
                      <small>{combatant.kind === "player" ? "PLAYER" : "ENEMY"}</small>
                    </div>
                    {isDm ? (
                      <input
                        className="initiative-input"
                        type="number"
                        min={-5}
                        max={50}
                        step={1}
                        value={value}
                        aria-label={`${combatant.name} initiative`}
                        title="Change initiative; saves when you leave the field"
                        onChange={(event) =>
                          setInitiativeDrafts((drafts) => ({
                            ...drafts,
                            [combatant.id]: event.target.value,
                          }))
                        }
                        onBlur={() => saveInitiative(combatant.id, combatant.initiative)}
                      />
                    ) : (
                      <span className="combatant-initiative">{combatant.initiative}</span>
                    )}
                    {isDm && combatant.kind === "enemy" && (
                      <button
                        className="combat-icon-button combat-remove-button"
                        aria-label={`Remove ${combatant.name}`}
                        title={`Remove ${combatant.name}`}
                        onClick={() => deleteCombatant(combatant.id)}
                        disabled={removeCombatant.isPending}
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {combat.attacks.length > 0 && (
            <div className="combat-attack-log">
              <div className="combat-subheading">
                <Dices size={13} /> RECENT ATTACKS
              </div>
              {[...combat.attacks].reverse().slice(0, 5).map((attack) => (
                <div className="combat-roll-row" key={attack.id}>
                  <span>
                    <strong>{attack.actorName}</strong>
                    <small> → {attack.targetName}</small>
                  </span>
                  <strong className="combat-roll-total">
                    {attack.d20Roll} {attack.dexterityModifier >= 0 ? "+" : "−"}{" "}
                    {Math.abs(attack.dexterityModifier)} = {attack.total}
                  </strong>
                </div>
              ))}
            </div>
          )}

          {error && <p className="form-error combat-error" role="alert">{error}</p>}
        </>
      )}

      {players.length === 0 && isDm && !combat?.active && (
        <p className="combat-hint">Players who have joined will be added when combat starts.</p>
      )}
    </section>
  );
}

export default CombatPanel;
