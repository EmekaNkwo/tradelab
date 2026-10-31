import { router } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { QualityReport } from "../../components/data/QualityReport";
import {
  AppText,
  Button,
  Card,
  CardHeader,
  ChoiceChips,
  LoadingState,
  Notice,
  Screen,
  TextField,
} from "../../components/ui";
import { Info } from "../../components/ui/icons";
import {
  DEFAULT_UTC_OFFSET,
  detailIssues,
  recheck,
  storedDatasetLabel,
  useCsvImport,
  type ImportDetails,
  type PickedFile,
} from "../../features/marketData";
import { useContainer } from "../../features/app";
import { errorText } from "../../shared/errors";
import {
  MARKET_KINDS,
  MARKET_LABELS,
  type MarketKind,
} from "../../shared/types";

/** Import a CSV file: pick it, read the data-quality report, describe the instrument, save. */
export default function ImportScreen() {
  const { state, pick, save, reset } = useCsvImport();
  useEffect(() => {
    if (state.status === "saved")
      router.replace({
        pathname: "/data/[id]",
        params: { id: state.dataset.id },
      });
  }, [state]);
  if (state.status === "picking" || state.status === "saved")
    return (
      <Screen>
        <LoadingState label="Reading the file…" />
      </Screen>
    );
  const file =
    state.status === "checked" || state.status === "saving"
      ? state.file
      : state.status === "error"
        ? state.file
        : null;
  return (
    <Screen testID="import-screen">
      <AppText variant="title">Import price data</AppText>
      {state.status === "error" ? (
        <Notice title="Not imported" tone="warning">
          {errorText(state.error)}
        </Notice>
      ) : null}
      {file ? (
        <>
          <AppText testID="import-file">{`File: ${file.fileName}`}</AppText>
          <DetailsForm
            file={file}
            saving={state.status === "saving"}
            onSave={(d) => void save(file, d)}
            onAnother={() => {
              reset();
              void pick();
            }}
          />
        </>
      ) : (
        <Card>
          <AppText>The first line must name the columns, for example:</AppText>
          <AppText variant="caption" color="textSecondary">
            date,open,high,low,close,volume
          </AppText>
          <AppText variant="caption" color="textSecondary">
            2024-01-02 09:00,1.1012,1.1020,1.1005,1.1018,1520
          </AppText>
          <AppText variant="caption" color="textSecondary">
            Separate date and time columns (as in MetaTrader exports) are
            joined. Times with no time zone are read at the UTC offset you set
            next (UTC by default). Up to 30,000 candles and 5 MB.
          </AppText>
          <Button label="Choose a CSV file" onPress={() => void pick()} />
        </Card>
      )}
    </Screen>
  );
}

function DetailsForm({
  file: picked,
  saving,
  onSave,
  onAnother,
}: {
  readonly file: PickedFile;
  readonly saving: boolean;
  readonly onSave: (d: ImportDetails) => void;
  readonly onAnother: () => void;
}) {
  const c = useContainer();
  const [details, setDetails] = useState<ImportDetails>({
    symbol: "",
    name: "",
    market: "forex",
    currency: "USD",
    utcOffset: DEFAULT_UTC_OFFSET,
  });
  // The report always shows the file as it reads with the chosen offset.
  const file = useMemo(
    () => recheck(c, picked, details.utcOffset),
    [c, picked, details.utcOffset],
  );
  const [issues, setIssues] = useState<readonly string[]>([]);
  const submit = () => {
    const found = detailIssues(details);
    setIssues(found);
    if (found.length === 0) onSave(details);
  };
  const offsetField = (
    <TextField
      label="UTC offset of the file’s times"
      value={details.utcOffset}
      onChangeText={(utcOffset) => setDetails({ ...details, utcOffset })}
      autoCapitalize="none"
      keyboardType="numbers-and-punctuation"
      testID="import-offset"
      hint="For times written without a time zone: +00:00 means they are UTC; +02:00 means two hours ahead of UTC. They are converted to UTC using this offset. Times that carry their own zone are not changed."
    />
  );
  if (file.result.report.status === "refused") {
    return (
      <>
        <QualityReport report={file.result.report} />
        {offsetField}
        <Button label="Choose another file" onPress={onAnother} />
      </>
    );
  }
  return (
    <>
      <QualityReport report={file.result.report} />
      <Card>
        <CardHeader icon={Info} tone="neutral" title="What is this data?" />
        <TextField
          label="Symbol"
          value={details.symbol}
          onChangeText={(symbol) => setDetails({ ...details, symbol })}
          autoCapitalize="characters"
          testID="import-symbol"
        />
        <TextField
          label="Name (optional)"
          value={details.name}
          onChangeText={(name) => setDetails({ ...details, name })}
        />
        <ChoiceChips
          label="Market"
          single
          options={MARKET_KINDS.map((m) => ({
            value: m,
            label: MARKET_LABELS[m],
          }))}
          selected={[details.market]}
          onChange={(v) =>
            v[0] && setDetails({ ...details, market: v[0] as MarketKind })
          }
        />
        <TextField
          label="Quote currency"
          value={details.currency}
          onChangeText={(currency) => setDetails({ ...details, currency })}
          autoCapitalize="characters"
        />
        {offsetField}
        <AppText variant="caption" color="textSecondary">
          In backtests and replay, this data uses the practice market’s
          teaching-example contract terms and costs for the market you choose.
          You can change costs in each backtest.
        </AppText>
        {issues.map((i) => (
          <AppText key={i} color="lossText">
            {i}
          </AppText>
        ))}
        <Button
          label={`Save as “${storedDatasetLabel({ origin: "user_import", sourceName: "Your file", fileName: file.fileName, symbol: details.symbol })}”`}
          onPress={submit}
          busy={saving}
        />
      </Card>
    </>
  );
}
