# Processos para prospecção geográfica e abertura de novos negócios

## Objetivo deste documento

Este documento descreve, em linguagem de negócio, como poderia funcionar um sistema para ajudar a equipe comercial a encontrar empresas com potencial dentro da área de atuação, priorizar oportunidades e encaixar visitas de prospecção em rotas já planejadas. É uma primeira hipótese para discussão — não é ainda uma especificação técnica nem uma estrutura definitiva do sistema.

A ideia central é combinar dados internos da empresa, informações empresariais obtidas de fontes apropriadas, critérios comerciais e dados geográficos. O sistema deve apoiar a decisão do vendedor, não substituir o conhecimento dele: cada recomendação precisa mostrar por que aquele prospect foi sugerido e o quanto os dados são confiáveis.

## Visão do processo de ponta a ponta

1. Definir a área atendida e os segmentos de interesse.
2. Reunir e organizar os dados internos de clientes e oportunidades.
3. Identificar empresas potenciais na região a partir de fontes autorizadas.
4. Completar e validar os dados das empresas.
5. Estimar aderência, potencial de compra e prioridade de abordagem.
6. Remover duplicidades e confrontar prospects com a carteira já atendida.
7. Planejar visitas e sugerir desvios de rota que façam sentido.
8. Registrar o resultado da visita e atualizar a inteligência comercial.
9. Medir resultados e ajustar regras e estimativas continuamente.

---

## Processo 1 — Definição do território e do perfil de cliente

Antes de buscar empresas, é preciso tornar explícito onde e para quem a equipe vende. A área pode ser definida por municípios, bairros, CEPs, raio em torno de uma base, polígonos no mapa ou territórios atribuídos a vendedores. Também convém definir se há áreas exclusivas, limites de deslocamento ou regiões que não devem ser atendidas.

O perfil de cliente ideal deve refletir a realidade comercial: CNAE ou atividade, porte, número de unidades, tipo de operação, materiais utilizados, capacidade de compra, distância aceitável, sazonalidade e outros sinais de necessidade. Um filtro muito amplo gera listas grandes e pouco úteis; um filtro estreito demais pode excluir bons clientes.

Para uma operação de venda de aço e materiais metálicos, vale organizar os critérios por **tipo de comprador** e **família de produto**, em vez de tratar todo negócio como um único perfil. Entre os segmentos a avaliar estão serralherias, calheiros e instaladores de coberturas, fabricantes de estruturas metálicas, construtoras e empreiteiras, indústrias e equipes de manutenção, revendas e distribuidores, além de clientes finais com obras ou operações que consumam esses materiais. As famílias de produto podem incluir bobinas galvanizadas e galvalume, tubos metalon, malhas, vergalhões, vigas I e U e perfis de aço. Esses exemplos são pontos de partida para validação comercial, não uma indicação de que cada segmento necessariamente compre todos os itens.

Também convém registrar se o prospect compra para transformação, revenda, aplicação em obra ou manutenção; quais produtos e especificações utiliza; e se decide a compra ou apenas influencia/especifica o material. Isso ajuda a separar consumidores efetivos de contatos que podem indicar ou influenciar uma oportunidade.

**Saída esperada:** território e critérios de busca compreensíveis, revisáveis e configuráveis pela empresa.

**Pontos a considerar:** separar critérios obrigatórios (por exemplo, dentro da região) de sinais que apenas aumentam ou reduzem a prioridade (por exemplo, porte, atividade econômica, família de produto consumida ou frequência de compra).

## Processo 2 — Preparação dos dados internos

Os dados dos clientes atuais são a referência para evitar abordagens duplicadas e descobrir oportunidades próximas. O processo começa com a importação ou integração da base já existente, como planilhas, CRM ou sistema de gestão, respeitando as permissões e regras internas.

É importante normalizar CNPJ, razão social, nome fantasia, endereço, município, contato, vendedor responsável, situação do relacionamento, histórico de compras e data da última atualização. Endereços incompletos ou antigos precisam ser sinalizados, não tratados como corretos automaticamente.

Também é útil identificar empresas do mesmo grupo, filiais e unidades operacionais. Um CNPJ pode representar uma matriz, enquanto a oportunidade de venda e a visita acontecem em uma filial. O sistema deve permitir que a equipe diferencie esses casos.

**Saída esperada:** uma visão confiável da carteira, com indicação da origem, atualização e qualidade de cada dado relevante.

## Processo 3 — Descoberta de novos potenciais clientes

Com o território e o perfil definidos, o sistema busca empresas potencialmente compatíveis. As fontes podem incluir bases empresariais públicas ou licenciadas, dados fornecidos pela própria empresa, cadastros autorizados e serviços de mapas/geocodificação cujos termos permitam esse uso.

A descoberta não deve depender de coleta indiscriminada de dados pessoais ou de raspagem de sites em desacordo com seus termos. Sempre que possível, priorizar dados empresariais e canais de contato profissionais. A fonte e a data de obtenção devem ser registradas para permitir auditoria e atualização.

A busca pode oferecer filtros por localização, atividade, situação cadastral, porte e outros campos disponíveis. Quando a fonte permitir, também pode classificar o tipo de operação (fabricação, instalação, obra, manutenção ou revenda) e indicar famílias de produto potencialmente relacionadas, sempre como hipótese a validar. Nem toda fonte terá todos os campos, e a cobertura pode variar por região.

**Saída esperada:** uma lista inicial de empresas candidatas, ainda não necessariamente qualificadas nem prontas para contato.

## Processo 4 — Enriquecimento, validação e qualidade dos dados

Para cada candidato, o sistema tenta confirmar e complementar dados como CNPJ, razão social, nome fantasia, endereço, atividade econômica, situação cadastral, unidade ou matriz/filial, site e canais empresariais disponíveis. A validação deve indicar o que foi confirmado, o que veio de uma fonte externa e o que está ausente ou divergente.

O endereço pode ser convertido em coordenadas (geocodificação) para aparecer no mapa e permitir estimar distâncias. Como endereços comerciais podem ser incompletos ou corresponder a escritórios contábeis, condomínios ou sedes administrativas, convém mostrar o nível de confiança e permitir correção pela equipe.

O faturamento anual merece tratamento cuidadoso: para muitas empresas, o valor exato não é público ou não está disponível. O sistema não deve apresentar uma estimativa como se fosse dado confirmado. Quando não houver dado verificável, pode mostrar faixa estimada, método, data e confiança — ou simplesmente “não disponível”.

**Saída esperada:** cadastro enriquecido com proveniência, atualização e grau de confiança por campo.

## Processo 5 — Estimativa de potencial de compra

O potencial de compra de materiais pode ser estimado a partir de sinais como atividade econômica, porte, número de unidades, área operacional, frequência de compra e histórico de clientes semelhantes. Se houver faturamento confiável, ele pode ser uma variável; sozinho, porém, não determina o consumo de material.

Uma estimativa mais útil pode combinar:

- consumo histórico de clientes atuais comparáveis;
- relação entre atividade, porte, tipo de operação e categorias de material potencialmente utilizadas;
- frequência e sazonalidade de reposição;
- quantidade de unidades ou capacidade operacional;
- escala e natureza dos serviços ou projetos, capacidade de fabricação/instalação e eventual atuação como revenda;
- especificações relevantes para a compra (por exemplo, dimensões, espessura, formato, acabamento e volume por pedido), quando conhecidas;
- dados observados pelo vendedor durante a qualificação;
- faturamento ou faixa de faturamento, somente quando a origem e a confiabilidade forem claras.

Como ponto de partida para a qualificação, uma serralheria pode ter relação com tubos metalon e perfis; calheiros e instaladores de coberturas podem demandar bobinas galvanizadas ou galvalume e perfis; e construtoras, fabricantes de estruturas ou indústrias podem utilizar diferentes combinações de perfis, vigas, tubos, malhas e vergalhões. Essas associações não devem ser tratadas como regra: o vendedor precisa confirmar aplicação, especificação, volume, frequência e processo de compra. O resultado deve ser expresso como faixa ou potencial relativo (por exemplo, baixo, médio, alto), acompanhado das premissas. Evitar uma previsão precisa em reais sem base histórica suficiente. A equipe deve conseguir corrigir a estimativa quando descobrir informação melhor.

**Saída esperada:** estimativa orientativa de oportunidade, com explicação dos fatores usados e margem de incerteza.

## Processo 6 — Deduplicação e identificação de relacionamento existente

Antes de transformar um candidato em lead, o sistema compara CNPJ, matriz/filial, nomes, endereços e outros identificadores com a base interna e com a lista já descoberta. O objetivo é evitar que dois vendedores abordem a mesma empresa sem coordenação ou que uma filial seja confundida com uma empresa totalmente nova.

A correspondência deve distinguir pelo menos: cliente ativo, cliente inativo, prospect já em negociação, lead sem contato, empresa do mesmo grupo e possível duplicata. Casos incertos devem ir para revisão humana, em vez de serem excluídos automaticamente.

**Saída esperada:** status de relacionamento visível, responsável comercial quando aplicável e prevenção de abordagens conflitantes.

## Processo 7 — Priorização e recomendação de abordagem

O ranking pode combinar aderência ao perfil ideal, potencial de compra por família de produto, distância e facilidade de visita, qualidade dos dados, sinais de necessidade, histórico de relacionamento e probabilidade de conversão. Pesos e critérios devem ser explicáveis e ajustáveis pela empresa. Um prospect pode ser aderente para uma linha de produtos e pouco relevante para outra; a recomendação deve deixar essa distinção visível.

É importante separar duas noções que podem competir: **valor potencial do negócio** e **facilidade/oportunidade de abordagem agora**. Uma empresa muito promissora, porém distante ou com dados ruins, pode receber uma prioridade diferente de um prospect um pouco menor, mas próximo de uma visita já marcada.

Cada recomendação deve responder “por que este lead está no topo?”. Exemplos: atividade compatível, localização próxima de um cliente a visitar, porte semelhante ao de clientes bem-sucedidos ou potencial de compra estimado. O sistema também deve permitir que o vendedor marque “não é aderente”, “já conheço”, “não abordar” ou “dados incorretos”, com motivo.

**Saída esperada:** uma fila priorizada, explicável e útil para a ação, não apenas uma pontuação opaca.

## Processo 8 — Planejamento de visitas e otimização de rota

O vendedor seleciona uma data, ponto de partida, compromissos fixos, clientes atuais a visitar e prospects disponíveis. O sistema calcula alternativas de percurso considerando distância ou tempo de deslocamento, janelas de atendimento, duração prevista das visitas, horário comercial, trânsito quando disponível, pausas e restrições definidas pela empresa.

Ao passar perto de um cliente atual, o sistema pode sugerir um ou mais prospects compatíveis no caminho. A recomendação precisa comparar o benefício com o custo do desvio: minutos e quilômetros adicionais, horário provável de chegada, importância do prospect e chance de encontrar alguém disponível. O vendedor deve poder aceitar, recusar ou reorganizar a sugestão.

A rota não deve ser otimizada somente pela menor distância. Uma rota ligeiramente maior pode ser melhor se incluir uma oportunidade prioritária; por outro lado, uma visita de baixo potencial não deve gerar um desvio desproporcional. A empresa pode definir limites, como desvio máximo, número de prospecções por dia ou tempo máximo de deslocamento.

**Saída esperada:** roteiro prático com sequência de visitas, tempo estimado, desvio incremental e motivo das sugestões.

## Processo 9 — Execução da visita e retorno de campo

O vendedor precisa ter acesso rápido aos dados essenciais do prospect e registrar o resultado da tentativa: visitado, contato realizado, responsável não encontrado, interesse, necessidade identificada, próxima ação, motivo de recusa ou correção de endereço. O registro deve ser simples para não atrapalhar a atividade em campo.

Se for usada localização do dispositivo do colaborador, o uso deve ser transparente, limitado ao necessário e de acordo com a política da empresa e a legislação aplicável. Uma alternativa menos intrusiva é registrar a localização apenas quando o vendedor inicia ou conclui uma visita, em vez de rastreamento contínuo.

**Saída esperada:** histórico comercial que ajuda a equipe e melhora as recomendações futuras, sem coleta excessiva de localização ou dados pessoais.

## Processo 10 — Aprendizado, atualização e controle

Os dados envelhecem: empresas mudam de endereço, atividade, situação ou porte. O sistema deve indicar quando dados foram consultados e permitir atualização periódica conforme a fonte e a necessidade. Leads sem validade, fora da área ou sem permissão de contato devem poder ser arquivados ou bloqueados.

O desempenho pode ser acompanhado por métricas como leads encontrados, dados válidos, visitas realizadas, conversões, vendas por segmento, custo/tempo por visita, oportunidades geradas por desvio de rota e diferenças entre potencial estimado e compra real. Essas métricas ajudam a calibrar os critérios sem confundir correlação com garantia de venda.

**Saída esperada:** melhoria contínua das regras, transparência sobre a qualidade das estimativas e controle do ciclo de vida dos dados.

---

## Ideias importantes que talvez ainda não estejam no escopo

- **Fontes e licenças de dados:** definir de onde virão CNPJ, endereços, porte, contatos e mapas; quais campos podem ser armazenados e com que frequência podem ser atualizados.
- **LGPD e governança:** definir finalidade, base legal com orientação adequada, retenção, acesso por perfil, canal para correção/remoção e tratamento de dados de contato de pessoas físicas. A avaliação jurídica deve ser feita com profissional qualificado; este documento não é aconselhamento jurídico.
- **Limites de contato e reputação:** lista de empresas que não devem ser contatadas, preferências de comunicação, frequência máxima de abordagem, clientes estratégicos e conflitos entre vendedores.
- **Disponibilidade de quem decide:** um endereço correto não garante que o decisor ou a operação esteja naquele local. Pode ser útil registrar melhor horário de visita e tipo de unidade.
- **Tempo realista de visita:** considerar estacionamento, pedágios, trânsito, tempo para reunião, carga/descarga, segurança da região e áreas de difícil acesso.
- **Cobertura sem conexão:** vendedores podem precisar consultar e registrar dados em locais com internet instável. Deve-se pensar em modo offline e sincronização, caso o uso em campo justifique.
- **Integração com ferramentas existentes:** CRM, ERP, agenda, telefonia, mapas, e-mail e relatórios; evitar criar cadastros paralelos se a empresa já possui um sistema de referência.
- **Territórios e atribuição:** regra para quem é dono do lead, como redistribuir oportunidades e como tratar vendedores de regiões sobrepostas.
- **Viés do ranking:** segmentos com dados mais completos podem aparecer indevidamente acima de segmentos menos documentados. Mostrar cobertura e confiança ajuda a reduzir esse problema.
- **Segurança:** acesso mínimo necessário, registro de alterações e proteção da base comercial, que pode ser um ativo sensível da empresa.
- **Sucesso mensurável:** antes de automatizar tudo, testar em uma região ou equipe e comparar com o processo atual, incluindo tempo economizado e conversão incremental.

## Perguntas para você

### Sobre a empresa e a venda
1. Quais produtos e especificações devem entrar no piloto — por exemplo, bobinas galvanizadas/galvalume, tubos metalon, malhas, vergalhões, vigas I/U e perfis? Há dimensões, espessuras, acabamentos ou volumes mínimos importantes?
2. Entre serralherias, calheiros/instaladores de coberturas, construtoras/empreiteiras, fabricantes de estruturas, indústrias/manutenção, revendas e clientes finais com obras, quais são os melhores clientes atuais? Há segmentos ou tipos de operação que não fazem sentido atender?
3. A venda é recorrente ou ligada a projetos/obras? Qual costuma ser o ciclo de compra, a frequência de reposição e o valor médio ou faixa de ticket por tipo de cliente ou produto?
4. Em que estados, cidades ou raio geográfico vocês atuam? Existem áreas exclusivas ou regiões a evitar?
5. O que define um “bom novo cliente” para vocês: potencial de faturamento, margem, recorrência, volume, facilidade de atendimento ou outro critério?

### Sobre dados e sistemas
6. Onde estão hoje os dados de clientes atendidos e histórico de compras — planilhas, CRM, ERP ou outro sistema?
7. A base tem CNPJ, endereço completo, filiais, vendedor responsável, data da última compra e valor comprado?
8. Vocês já têm uma fonte ou fornecedor desejado para dados empresariais, endereços, faturamento ou mapas? Há orçamento/licenças disponíveis?
9. Para estimar potencial, quais sinais são mais úteis para vocês: volume e frequência de compra, porte da operação, tipo/escala de obra, capacidade de fabricação, produtos utilizados ou faturamento? É aceitável começar com uma faixa qualitativa, como baixo/médio/alto, até haver histórico suficiente?
10. Há regras internas ou orientação jurídica sobre prospecção, dados pessoais de contatos e retenção das informações?

### Sobre a rotina comercial e as rotas
11. Quantos vendedores usarão o sistema e como cada um recebe hoje sua carteira e suas metas?
12. As visitas já são agendadas com antecedência ou o vendedor decide o roteiro no mesmo dia?
13. Qual é o ponto de partida e de retorno: residência, filial, cliente anterior ou local variável? Devemos considerar carro, moto, transporte público ou mais de um modo?
14. Qual desvio máximo (em minutos ou quilômetros) faria sentido para visitar um novo prospect no caminho?
15. Há duração típica de visita, janelas de atendimento, pausas, pedágios ou restrições de horário que o roteiro deve respeitar?
16. Você quer apenas sugerir leads e rotas, ou também registrar visitas, contatos, tarefas de retorno e oportunidades de venda?
17. A localização do vendedor deve ser usada somente para iniciar/finalizar visita ou há uma necessidade real de acompanhamento contínuo? Quem verá esses dados?

### Sobre priorização e validação
18. Quais sinais fariam um prospect ser prioridade máxima? E quais seriam motivos para não abordar?
19. Prefere que a pontuação seja configurada por você, aprendida do histórico de vendas ou inicialmente baseada em regras simples e explicáveis?
20. Que resultado justificaria um piloto bem-sucedido após, por exemplo, algumas semanas: mais visitas, mais conversões, menor custo por visita ou economia de tempo?
21. Quem deve revisar possíveis duplicidades, endereços duvidosos e estimativas de baixa confiança?
22. Há informações ou funcionalidades que você considera sensíveis e que não devem ser incluídas?

## Próxima etapa sugerida

Depois das suas respostas, este documento pode ser ajustado para refletir o processo real da empresa. Só então faria sentido elaborar uma especificação funcional priorizada — começando por um piloto pequeno, com fontes de dados confirmadas, métricas de sucesso e limites claros para estimativas e uso de localização.
