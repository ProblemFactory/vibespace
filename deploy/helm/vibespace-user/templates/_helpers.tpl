{{- define "vs.name" -}}vibespace-{{ .Values.user }}{{- end -}}
{{- define "vs.host" -}}
{{- if .Values.host }}{{ .Values.host }}{{ else }}{{ .Values.user }}.{{ .Values.domain }}{{ end -}}
{{- end -}}
{{- define "vs.labels" -}}
app.kubernetes.io/name: vibespace
app.kubernetes.io/instance: {{ .Values.user }}
app.kubernetes.io/managed-by: helm
{{- end -}}
{{- define "vs.require" -}}
{{- if not .Values.user }}{{ fail "set --set user=<name>" }}{{ end }}
{{- if not .Values.password }}{{ fail "set --set password=<pw>" }}{{ end }}
{{- with .Values.maintainerKeySha }}{{ if not (regexMatch "^[0-9a-f]{64}$" (toString .)) }}{{ fail "maintainerKeySha is the maintainer key's sha256 (64 lowercase hex) — never the key itself" }}{{ end }}{{ end }}
{{- end -}}
