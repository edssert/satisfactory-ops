#include "SatisfactoryOpsRenderRig.h"

#include "Buildables/FGBuildable.h"
#include "AbstractInstanceInterface.h"
#include "InstanceData.h"
#include "Components/RectLightComponent.h"
#include "Components/PrimitiveComponent.h"
#include "Components/MeshComponent.h"
#include "Components/SkyLightComponent.h"
#include "ContentStreaming.h"
#include "Components/SceneCaptureComponent2D.h"
#include "Camera/CameraComponent.h"
#include "Components/StaticMeshComponent.h"
#include "Components/SkeletalMeshComponent.h"
#include "Dom/JsonObject.h"
#include "Engine/StaticMesh.h"
#include "Engine/SkeletalMesh.h"
#include "Engine/Light.h"
#include "Engine/SkyLight.h"
#include "Engine/TextureRenderTarget2D.h"
#include "Engine/Texture2D.h"
#include "Engine/Texture2DArray.h"
#include "Engine/GameViewportClient.h"
#include "GameFramework/PlayerController.h"
#include "FGClearanceData.h"
#include "FGBuildableSubsystem.h"
#include "FGFactoryConnectionComponent.h"
#include "FGFactorySettings.h"
#include "FGPipeConnectionComponent.h"
#include "FGPowerConnectionComponent.h"
#include "FGProductionIndicatorInstanceComponent.h"
#include "FGSaveSession.h"
#include "FGCharacterPlayer.h"
#include "Equipment/FGBuildGun.h"
#include "Equipment/FGBuildGunBuild.h"
#include "FGRecipe.h"
#include "FGVertexAnimatedMeshComponent.h"
#include "HAL/FileManager.h"
#include "HAL/PlatformMisc.h"
#include "ImageCore.h"
#include "ImageUtils.h"
#include "Kismet/KismetMathLibrary.h"
#include "Materials/MaterialInterface.h"
#include "Materials/MaterialInstance.h"
#include "Misc/CommandLine.h"
#include "Misc/FileHelper.h"
#include "Misc/Paths.h"
#include "Misc/Parse.h"
#include "SatisfactoryOpsPortHologram.h"
#include "EngineUtils.h"
#include "Serialization/JsonSerializer.h"
#include "Serialization/JsonWriter.h"

DEFINE_LOG_CATEGORY_STATIC(LogSatisfactoryOpsRenderRig, Log, All);

namespace
{
constexpr float RenderOrigin = 1000000.0f;
constexpr float IsoElevationDegrees = 45.0f;
constexpr float IsoFieldOfViewDegrees = 28.0f;
constexpr float FrameMargin = 1.12f;
const float IsoAzimuths[] = {45.0f, 135.0f, 225.0f, 315.0f};

FString ViewFileName(const int32 Index)
{
    if (Index == 0)
    {
        return TEXT("top.png");
    }
    const bool bTechnical = Index >= 5;
    const int32 DirectionIndex = bTechnical ? Index - 5 : Index - 1;
    return FString::Printf(
        TEXT("%s-%03d.png"),
        bTechnical ? TEXT("technical") : TEXT("beauty"),
        FMath::RoundToInt(IsoAzimuths[DirectionIndex]));
}

TSharedPtr<FJsonObject> TransformToJson(const FTransform& Transform)
{
    const FVector Translation = Transform.GetTranslation();
    const FQuat Rotation = Transform.GetRotation();
    const FVector Scale = Transform.GetScale3D();
    TSharedPtr<FJsonObject> Json = MakeShared<FJsonObject>();
    Json->SetArrayField(TEXT("translationCm"), {
        MakeShared<FJsonValueNumber>(Translation.X), MakeShared<FJsonValueNumber>(Translation.Y), MakeShared<FJsonValueNumber>(Translation.Z)});
    Json->SetArrayField(TEXT("rotationQuat"), {
        MakeShared<FJsonValueNumber>(Rotation.X), MakeShared<FJsonValueNumber>(Rotation.Y),
        MakeShared<FJsonValueNumber>(Rotation.Z), MakeShared<FJsonValueNumber>(Rotation.W)});
    Json->SetArrayField(TEXT("scale"), {
        MakeShared<FJsonValueNumber>(Scale.X), MakeShared<FJsonValueNumber>(Scale.Y), MakeShared<FJsonValueNumber>(Scale.Z)});
    return Json;
}

TSharedPtr<FJsonObject> BoxToJson(const FBox& Box)
{
    TSharedPtr<FJsonObject> Json = MakeShared<FJsonObject>();
    Json->SetArrayField(TEXT("minCm"), {
        MakeShared<FJsonValueNumber>(Box.Min.X), MakeShared<FJsonValueNumber>(Box.Min.Y), MakeShared<FJsonValueNumber>(Box.Min.Z)});
    Json->SetArrayField(TEXT("maxCm"), {
        MakeShared<FJsonValueNumber>(Box.Max.X), MakeShared<FJsonValueNumber>(Box.Max.Y), MakeShared<FJsonValueNumber>(Box.Max.Z)});
    return Json;
}

TArray<TSharedPtr<FJsonValue>> StringArrayToJson(const TArray<FString>& Values)
{
    TArray<TSharedPtr<FJsonValue>> Result;
    for (const FString& Value : Values) Result.Add(MakeShared<FJsonValueString>(Value));
    return Result;
}
}

ASatisfactoryOpsRenderRig::ASatisfactoryOpsRenderRig()
{
    PrimaryActorTick.bCanEverTick = true;
    PrimaryActorTick.bStartWithTickEnabled = false;
    SetActorEnableCollision(false);

    SceneRoot = CreateDefaultSubobject<USceneComponent>(TEXT("SceneRoot"));
    SetRootComponent(SceneRoot);

    Capture = CreateDefaultSubobject<USceneCaptureComponent2D>(TEXT("Capture"));
    Capture->SetupAttachment(SceneRoot);
    Capture->bCaptureEveryFrame = false;
    Capture->bCaptureOnMovement = false;
    Capture->CaptureSource = ESceneCaptureSource::SCS_FinalColorHDR;
    Capture->ShowFlags.SetAtmosphere(false);
    Capture->ShowFlags.SetFog(false);
    Capture->ShowFlags.SetVolumetricFog(false);
    Capture->ShowFlags.SetCloud(false);
    Capture->PostProcessSettings.bOverride_AutoExposureMethod = true;
    Capture->PostProcessSettings.AutoExposureMethod = EAutoExposureMethod::AEM_Manual;
    Capture->PostProcessSettings.bOverride_AutoExposureBias = true;
    Capture->PostProcessSettings.AutoExposureBias = 0.0f;
    Capture->PostProcessSettings.bOverride_BloomIntensity = true;
    Capture->PostProcessSettings.BloomIntensity = 0.0f;

    ViewCamera = CreateDefaultSubobject<UCameraComponent>(TEXT("ViewCamera"));
    ViewCamera->SetupAttachment(SceneRoot);
    ViewCamera->SetActive(false);

    KeyLight = CreateDefaultSubobject<URectLightComponent>(TEXT("KeyLight"));
    KeyLight->SetupAttachment(SceneRoot);
    KeyLight->SetIntensity(22000.0f);
    KeyLight->SetSourceWidth(600.0f);
    KeyLight->SetSourceHeight(600.0f);
    KeyLight->SetLightColor(FLinearColor(1.0f, 0.98f, 0.95f));

    FillLight = CreateDefaultSubobject<URectLightComponent>(TEXT("FillLight"));
    FillLight->SetupAttachment(SceneRoot);
    FillLight->SetIntensity(12000.0f);
    FillLight->SetSourceWidth(800.0f);
    FillLight->SetSourceHeight(800.0f);
    FillLight->SetLightColor(FLinearColor(0.92f, 0.96f, 1.0f));

    RimLight = CreateDefaultSubobject<URectLightComponent>(TEXT("RimLight"));
    RimLight->SetupAttachment(SceneRoot);
    RimLight->SetIntensity(16000.0f);
    RimLight->SetSourceWidth(500.0f);
    RimLight->SetSourceHeight(700.0f);
    RimLight->SetLightColor(FLinearColor::White);
}

bool ASatisfactoryOpsRenderRig::StartFromCommandLine()
{
    if (!FParse::Value(FCommandLine::Get(), TEXT("SatisfactoryOpsClass="), MachineClassPath))
    {
        UE_LOG(LogSatisfactoryOpsRenderRig, Error, TEXT("-SatisfactoryOpsClass가 필요합니다."));
        return false;
    }

    FoundationClassPath = TEXT("/Game/FactoryGame/Buildable/Building/Foundation/Build_Foundation_8x1_01.Build_Foundation_8x1_01_C");
    FParse::Value(FCommandLine::Get(), TEXT("SatisfactoryOpsFoundation="), FoundationClassPath);

    if (!FParse::Value(FCommandLine::Get(), TEXT("SatisfactoryOpsOutput="), OutputDirectory))
    {
        OutputDirectory = FPaths::Combine(FPaths::ProjectSavedDir(), TEXT("SatisfactoryOpsRender"));
    }
    OutputDirectory = FPaths::ConvertRelativePathToFull(OutputDirectory);

    FParse::Value(FCommandLine::Get(), TEXT("SatisfactoryOpsResolution="), Resolution);
    bProbeOnly = FParse::Param(FCommandLine::Get(), TEXT("SatisfactoryOpsProbeOnly"));
    bViewportReference = FParse::Param(FCommandLine::Get(), TEXT("SatisfactoryOpsViewportReference"));
    Resolution = FMath::Clamp(Resolution, 256, 8192);
    IFileManager::Get().MakeDirectory(*OutputDirectory, true);

    if (!BuildScene())
    {
        return false;
    }

    if (bProbeOnly)
    {
        if (!WriteProbe()) return false;
        FPlatformMisc::RequestExitWithStatus(false, 0);
        return true;
    }

    if (bViewportReference)
    {
        SetTechnicalVisible(true);
        ConfigureIsoCamera(SceneBounds, 135.0f);
        ViewCamera->SetWorldTransform(Capture->GetComponentTransform());
        ViewCamera->SetFieldOfView(Capture->FOVAngle);
        ViewCamera->SetActive(true);
        if (APlayerController* Controller = GetWorld()->GetFirstPlayerController())
        {
            Controller->SetViewTarget(this);
            if (AFGCharacterPlayer* Player = Cast<AFGCharacterPlayer>(Controller->GetPawn()))
            {
                Player->EquipBuildGunAndGoToMenuState();
                if (AFGBuildGun* BuildGun = Player->GetBuildGun())
                {
                    UClass* RecipeClass = LoadObject<UClass>(
                        nullptr,
                        TEXT("/Game/FactoryGame/Recipes/Buildings/Recipe_GeneratorBiomass_Automated.Recipe_GeneratorBiomass_Automated_C"));
                    if (RecipeClass && RecipeClass->IsChildOf(UFGRecipe::StaticClass()))
                    {
                        BuildGun->GotoBuildState(RecipeClass);
                    }
                }
            }
        }
    }

    SetActorTickEnabled(true);
    UE_LOG(LogSatisfactoryOpsRenderRig, Display, TEXT("장면 준비 완료: %s"), *MachineClassPath);
    return true;
}

void ASatisfactoryOpsRenderRig::Tick(float DeltaSeconds)
{
    Super::Tick(DeltaSeconds);

    if (WarmupFrames > 0)
    {
        --WarmupFrames;
        return;
    }

    if (bViewportReference)
    {
        if (APlayerController* Controller = GetWorld()->GetFirstPlayerController())
        {
            if (AFGCharacterPlayer* Player = Cast<AFGCharacterPlayer>(Controller->GetPawn()))
            {
                if (AFGBuildGun* BuildGun = Player->GetBuildGun())
                {
                    if (UFGBuildGunStateBuild* BuildState = Cast<UFGBuildGunStateBuild>(BuildGun->GetCurrentState()))
                    {
                        if (AFGHologram* LiveHologram = BuildState->GetHologram())
                        {
                            LiveHologram->SetActorTransform(Machine->GetActorTransform());
                            LiveHologram->SetPlacementMaterialState(EHologramMaterialState::HMS_OK);
                        }
                    }
                }
            }
        }
        const FString ScreenshotPath = FPaths::Combine(OutputDirectory, TEXT("clearance-reference.png"));
        if (!bViewportScreenshotRequested)
        {
            FScreenshotRequest::RequestScreenshot(ScreenshotPath, false, false);
            bViewportScreenshotRequested = true;
            return;
        }
        if (FPaths::FileExists(ScreenshotPath))
        {
            UE_LOG(LogSatisfactoryOpsRenderRig, Display, TEXT("viewport reference 저장: %s"), *ScreenshotPath);
            SetActorTickEnabled(false);
            FPlatformMisc::RequestExitWithStatus(false, 0);
        }
        return;
    }

    if (!CaptureNextView())
    {
        UE_LOG(LogSatisfactoryOpsRenderRig, Error, TEXT("뷰 %d 렌더 실패"), ViewIndex);
        FPlatformMisc::RequestExitWithStatus(true, 22);
        return;
    }

    ++ViewIndex;
    if (ViewIndex >= 9)
    {
        const FString Receipt = FString::Printf(
            TEXT("{\n  \"schemaVersion\": 1,\n  \"machineClass\": \"%s\",\n  \"foundationClass\": \"%s\",\n  \"resolution\": %d,\n  \"views\": 9,\n  \"sceneAssembly\": \"single-runtime-scene\",\n  \"cameraOnlyChanges\": true\n}\n"),
            *MachineClassPath.ReplaceCharWithEscapedChar(),
            *FoundationClassPath.ReplaceCharWithEscapedChar(),
            Resolution);
        FFileHelper::SaveStringToFile(
            Receipt,
            *FPaths::Combine(OutputDirectory, TEXT("receipt.json")),
            FFileHelper::EEncodingOptions::ForceUTF8WithoutBOM);
        UE_LOG(LogSatisfactoryOpsRenderRig, Display, TEXT("9개 뷰 렌더 완료: %s"), *OutputDirectory);
        SetActorTickEnabled(false);
        FPlatformMisc::RequestExitWithStatus(false, 0);
    }
}

bool ASatisfactoryOpsRenderRig::BuildScene()
{
    if (UFGSaveSession* SaveSession = UFGSaveSession::Get(this))
    {
        SaveSession->SetAutoSaveEnabled(false);
    }

    UClass* FoundationClass = LoadObject<UClass>(nullptr, *FoundationClassPath);
    UClass* MachineClass = LoadObject<UClass>(nullptr, *MachineClassPath);
    if (!FoundationClass || !FoundationClass->IsChildOf(AFGBuildable::StaticClass()) ||
        !MachineClass || !MachineClass->IsChildOf(AFGBuildable::StaticClass()))
    {
        UE_LOG(LogSatisfactoryOpsRenderRig, Error, TEXT("게임 Buildable 클래스를 로드하지 못했습니다."));
        return false;
    }

    const float SceneOrigin = bViewportReference ? 100000.0f : RenderOrigin;
    const FVector Origin(SceneOrigin, SceneOrigin, SceneOrigin);
    AFGBuildableSubsystem* BuildableSubsystem = AFGBuildableSubsystem::Get(this);
    if (!BuildableSubsystem)
    {
        UE_LOG(LogSatisfactoryOpsRenderRig, Error, TEXT("FGBuildableSubsystem이 없습니다."));
        return false;
    }

    const FTransform FoundationTransform(FRotator::ZeroRotator, Origin);
    Foundation = BuildableSubsystem->BeginSpawnBuildable(FoundationClass, FoundationTransform);
    if (!Foundation)
    {
        UE_LOG(LogSatisfactoryOpsRenderRig, Error, TEXT("Foundation BeginSpawnBuildable 실패: %s flags=%x"), *FoundationClassPath, FoundationClass->GetClassFlags());
        return false;
    }
    Foundation->SetFlags(RF_Transient);
    Foundation->SetReplicates(false);
    Foundation->FinishSpawning(FoundationTransform);

    const float FoundationTop = GetLocalClearanceMaxZ(Foundation);
    const FTransform InitialMachineTransform(FRotator::ZeroRotator, Origin);
    Machine = BuildableSubsystem->BeginSpawnBuildable(MachineClass, InitialMachineTransform);
    if (!Machine)
    {
        UE_LOG(LogSatisfactoryOpsRenderRig, Error, TEXT("Machine BeginSpawnBuildable 실패: %s flags=%x"), *MachineClassPath, MachineClass->GetClassFlags());
        return false;
    }
    Machine->SetFlags(RF_Transient);
    Machine->SetReplicates(false);
    const float MachineBottom = GetLocalClearanceMinZ(Machine);
    const FTransform MachineTransform(FRotator::ZeroRotator, Origin + FVector(0.0f, 0.0f, FoundationTop - MachineBottom));
    Machine->FinishSpawning(MachineTransform);

    Foundation->SetActorEnableCollision(false);
    Machine->SetActorEnableCollision(false);

    TInlineComponentArray<UFGProductionIndicatorInstanceComponent*> Indicators(Machine);
    for (UFGProductionIndicatorInstanceComponent* Indicator : Indicators)
    {
        Indicator->SetVisuals(EProductionStatus::IS_PRODUCING);
    }
    TInlineComponentArray<UFGVertexAnimatedMeshComponent*> AnimatedMeshes(Machine);
    for (UFGVertexAnimatedMeshComponent* AnimatedMesh : AnimatedMeshes)
    {
        AnimatedMesh->OnProductionStatusChanged(EProductionStatus::IS_STANDBY);
    }

    SceneBounds = GetWorldClearanceBounds(Foundation) + GetWorldClearanceBounds(Machine);
    const FBox FoundationVisualBounds = Foundation->GetComponentsBoundingBox(true);
    const FBox MachineVisualBounds = Machine->GetComponentsBoundingBox(true);
    if (FoundationVisualBounds.IsValid) SceneBounds += FoundationVisualBounds;
    if (MachineVisualBounds.IsValid) SceneBounds += MachineVisualBounds;
    if (!SceneBounds.IsValid)
    {
        UE_LOG(LogSatisfactoryOpsRenderRig, Error, TEXT("게임 clearance bounds가 유효하지 않습니다."));
        return false;
    }

    RenderTarget = NewObject<UTextureRenderTarget2D>(this, TEXT("SatisfactoryOpsRenderTarget"), RF_Transient);
    RenderTarget->RenderTargetFormat = ETextureRenderTargetFormat::RTF_RGBA16f;
    RenderTarget->ClearColor = FLinearColor(0.0f, 0.0f, 0.0f, 0.0f);
    RenderTarget->bAutoGenerateMips = false;
    RenderTarget->InitAutoFormat(Resolution, Resolution);
    RenderTarget->UpdateResourceImmediate(true);
    Capture->TextureTarget = RenderTarget;

    if (!CreateTechnicalMeshes())
    {
        return false;
    }
    for (UStaticMeshComponent* Mesh : TechnicalMeshes)
    {
        if (Mesh)
        {
            Mesh->UpdateBounds();
            SceneBounds += Mesh->Bounds.GetBox();
        }
    }

    for (TActorIterator<ALight> It(GetWorld()); It; ++It)
    {
        It->GetLightComponent()->SetVisibility(false);
    }
    for (TActorIterator<ASkyLight> It(GetWorld()); It; ++It)
    {
        It->GetLightComponent()->SetVisibility(false);
    }

    const bool bReferenceCapture = FParse::Param(FCommandLine::Get(), TEXT("SatisfactoryOpsReference"));
    Capture->PrimitiveRenderMode = bReferenceCapture
        ? ESceneCapturePrimitiveRenderMode::PRM_RenderScenePrimitives
        : ESceneCapturePrimitiveRenderMode::PRM_UseShowOnlyList;
    if (!bReferenceCapture)
    {
        Capture->ClearShowOnlyComponents();
        Capture->ShowOnlyActorComponents(Foundation, true);
        Capture->ShowOnlyActorComponents(Machine, true);
        Capture->ShowOnlyActorComponents(PortHologram, true);
    }

    const FVector Center = SceneBounds.GetCenter();
    const float Radius = SceneBounds.GetExtent().Size();
    const auto AimLight = [Center](URectLightComponent* Light, const FVector& Position)
    {
        Light->SetWorldLocation(Position);
        Light->SetWorldRotation(UKismetMathLibrary::FindLookAtRotation(Position, Center));
    };
    AimLight(KeyLight, Center + FVector(Radius * 1.5f, -Radius * 1.8f, Radius * 2.2f));
    AimLight(FillLight, Center + FVector(-Radius * 1.8f, -Radius * 0.8f, Radius * 1.2f));
    AimLight(RimLight, Center + FVector(0.0f, Radius * 2.0f, Radius * 1.8f));

    const auto ForceActorMips = [](AActor* Actor)
    {
        TInlineComponentArray<UPrimitiveComponent*> Primitives(Actor);
        for (UPrimitiveComponent* Primitive : Primitives)
        {
            Primitive->bForceMipStreaming = true;
            Primitive->MarkRenderStateDirty();
        }
        TInlineComponentArray<UMeshComponent*> Meshes(Actor);
        for (UMeshComponent* Mesh : Meshes)
        {
            Mesh->PrestreamTextures(60.0f, true, 0xFFFFFFFF);
        }
    };
    ForceActorMips(Foundation);
    ForceActorMips(Machine);
    ForceActorMips(PortHologram);

    // Lightweight/AbstractInstance로 그려지는 buildable은 actor의 UMeshComponent 순회만으로
    // 실제 static-mesh 재질이 잡히지 않는다. 모든 buildable에 같은 재질 수집 규칙을 적용한다.
    TSet<UMaterialInterface*> StreamingMaterials;
    const auto CollectStreamingMaterials = [&StreamingMaterials](AFGBuildable* Buildable)
    {
        TInlineComponentArray<UMeshComponent*> Meshes(Buildable);
        for (UMeshComponent* Mesh : Meshes)
        {
            for (int32 Slot = 0; Slot < Mesh->GetNumMaterials(); ++Slot)
            {
                if (UMaterialInterface* Material = Mesh->GetMaterial(Slot)) StreamingMaterials.Add(Material);
            }
        }
        const UAbstractInstanceDataObject* InstanceData = Buildable->GetLightweightInstanceData();
        const TArray<FInstanceData> Instances = InstanceData
            ? InstanceData->GetInstanceData()
            : Buildable->GetActorLightweightInstanceData_Implementation();
        for (const FInstanceData& Instance : Instances)
        {
            if (Instance.OverridenMaterials.Num() > 0)
            {
                for (UMaterialInterface* Material : Instance.OverridenMaterials)
                    if (Material) StreamingMaterials.Add(Material);
            }
            else if (Instance.StaticMesh)
            {
                for (const FStaticMaterial& Slot : Instance.StaticMesh->GetStaticMaterials())
                    if (Slot.MaterialInterface) StreamingMaterials.Add(Slot.MaterialInterface);
            }
        }
    };
    CollectStreamingMaterials(Foundation);
    CollectStreamingMaterials(Machine);
    for (UMaterialInterface* Material : StreamingMaterials)
    {
        Material->SetForceMipLevelsToBeResident(false, false, 60.0f, 0xFFFFFFFF, true);
    }
    const int32 StreamingRemaining = IStreamingManager::Get().StreamAllResources(60.0f);
    UE_LOG(LogSatisfactoryOpsRenderRig, Display, TEXT("texture streaming remaining=%d"), StreamingRemaining);

    SetTechnicalVisible(false);
    bSceneBuilt = true;
    return true;
}

bool ASatisfactoryOpsRenderRig::CreateTechnicalMeshes()
{
    const FTransform HologramTransform = Machine->GetActorTransform();
    PortHologram = GetWorld()->SpawnActorDeferred<ASatisfactoryOpsPortHologram>(
        ASatisfactoryOpsPortHologram::StaticClass(),
        HologramTransform,
        nullptr,
        nullptr,
        ESpawnActorCollisionHandlingMethod::AlwaysSpawn);
    if (!PortHologram)
    {
        return false;
    }
    PortHologram->SetFlags(RF_Transient);
    PortHologram->InitializeBuildableClass(Machine->GetClass());
    PortHologram->FinishSpawning(HologramTransform);
    PortHologram->SetPlacementMaterialState(EHologramMaterialState::HMS_OK);

    UStaticMeshComponent* NativeClearanceVisualization = PortHologram->GetClearanceVisualization();
    const bool bReferenceCapture = FParse::Param(FCommandLine::Get(), TEXT("SatisfactoryOpsReference"));
    TInlineComponentArray<UPrimitiveComponent*> BaseHologramVisuals(PortHologram);
    for (UPrimitiveComponent* Component : BaseHologramVisuals)
    {
        if (bReferenceCapture && Component == NativeClearanceVisualization)
        {
            Component->SetVisibility(true, true);
            Component->SetHiddenInGame(false, true);
            UE_LOG(
                LogSatisfactoryOpsRenderRig,
                Display,
                TEXT("native clearance visualization=%s mesh=%s material=%s transform=%s"),
                *Component->GetName(),
                NativeClearanceVisualization->GetStaticMesh() ? *NativeClearanceVisualization->GetStaticMesh()->GetPathName() : TEXT("null"),
                NativeClearanceVisualization->GetMaterial(0) ? *NativeClearanceVisualization->GetMaterial(0)->GetPathName() : TEXT("null"),
                *NativeClearanceVisualization->GetComponentTransform().ToHumanReadableString());
            continue;
        }
        Component->SetVisibility(false, true);
        Component->SetHiddenInGame(true, true);
    }

    TInlineComponentArray<UFGFactoryConnectionComponent*> FactoryConnections(Machine);
    for (UFGFactoryConnectionComponent* Connection : FactoryConnections)
    {
        TechnicalMeshes.Append(PortHologram->CreateFactoryPortMeshes(Connection, Machine->GetRootComponent()));
    }
    TInlineComponentArray<UFGPowerConnectionComponent*> PowerConnections(Machine);
    for (UFGPowerConnectionComponent* Connection : PowerConnections)
    {
        TechnicalMeshes.Append(PortHologram->CreatePowerPortMeshes(Connection, Machine->GetRootComponent()));
    }
    TInlineComponentArray<UFGPipeConnectionComponentBase*> PipeConnections(Machine);
    for (UFGPipeConnectionComponentBase* Connection : PipeConnections)
    {
        TechnicalMeshes.Append(PortHologram->CreatePipePortMeshes(Connection, Machine->GetRootComponent()));
    }

    const UFGFactorySettings* Settings = UFGFactorySettings::Get();
    if (!Settings || !Settings->mClearanceMesh || !Settings->mClearanceMaterial)
    {
        UE_LOG(LogSatisfactoryOpsRenderRig, Error, TEXT("FactorySettings clearance 자산이 없습니다."));
        return false;
    }

    TArray<FFGClearanceData> ClearanceData;
    Machine->GetClearanceData_Implementation(ClearanceData);
    const FBox MeshBox = Settings->mClearanceMesh->GetBoundingBox();
    const FVector MeshSize = MeshBox.GetSize();
    if (MeshSize.GetMin() <= UE_SMALL_NUMBER)
    {
        return false;
    }

    for (int32 Index = 0; Index < ClearanceData.Num(); ++Index)
    {
        const FFGClearanceData& Data = ClearanceData[Index];
        if (!Data.IsValid())
        {
            continue;
        }

        USceneComponent* ClearanceRoot = NewObject<USceneComponent>(PortHologram, *FString::Printf(TEXT("ClearanceRoot_%d"), Index));
        ClearanceRoot->SetupAttachment(Machine->GetRootComponent());
        ClearanceRoot->SetRelativeTransform(Data.RelativeTransform);
        ClearanceRoot->RegisterComponent();

        UStaticMeshComponent* Mesh = NewObject<UStaticMeshComponent>(PortHologram, *FString::Printf(TEXT("ClearanceMesh_%d"), Index));
        Mesh->SetupAttachment(ClearanceRoot);
        Mesh->SetStaticMesh(Settings->mClearanceMesh);
        Mesh->SetMaterial(0, Settings->mClearanceMaterial);
        Mesh->SetCollisionEnabled(ECollisionEnabled::NoCollision);
        const FVector Scale = Data.ClearanceBox.GetSize() / MeshSize;
        const FVector Translation = Data.ClearanceBox.GetCenter() - MeshBox.GetCenter() * Scale;
        Mesh->SetRelativeTransform(FTransform(FQuat::Identity, Translation, Scale));
        Mesh->RegisterComponent();
        TechnicalMeshes.Add(Mesh);
    }

    for (UStaticMeshComponent* Mesh : TechnicalMeshes)
    {
        if (!Mesh) continue;
        const UMaterialInterface* Material = Mesh->GetNumMaterials() > 0 ? Mesh->GetMaterial(0) : nullptr;
        UE_LOG(
            LogSatisfactoryOpsRenderRig,
            Display,
            TEXT("technical mesh=%s asset=%s material=%s transform=%s"),
            *Mesh->GetName(),
            Mesh->GetStaticMesh() ? *Mesh->GetStaticMesh()->GetPathName() : TEXT("null"),
            Material ? *Material->GetPathName() : TEXT("null"),
            *Mesh->GetComponentTransform().ToHumanReadableString());
    }

    return TechnicalMeshes.Num() > 0;
}

bool ASatisfactoryOpsRenderRig::CaptureNextView()
{
    if (!bSceneBuilt || ViewIndex < 0 || ViewIndex >= 9)
    {
        return false;
    }

    const bool bTechnical = ViewIndex >= 5;
    SetTechnicalVisible(bTechnical);
    if (ViewIndex == 0)
    {
        ConfigureTopCamera(SceneBounds);
    }
    else
    {
        const int32 DirectionIndex = bTechnical ? ViewIndex - 5 : ViewIndex - 1;
        ConfigureIsoCamera(SceneBounds, IsoAzimuths[DirectionIndex]);
    }

    Capture->CaptureScene();
    return SaveCapture(ViewFileName(ViewIndex));
}

bool ASatisfactoryOpsRenderRig::SaveCapture(const FString& FileName) const
{
    FImage Image;
    if (!FImageUtils::GetRenderTargetImage(RenderTarget, Image))
    {
        return false;
    }
    return FImageUtils::SaveImageByExtension(
        *FPaths::Combine(OutputDirectory, FileName),
        Image,
        100);
}

bool ASatisfactoryOpsRenderRig::WriteProbe() const
{
    TSharedPtr<FJsonObject> Root = MakeShared<FJsonObject>();
    Root->SetNumberField(TEXT("schemaVersion"), 1);
    Root->SetStringField(TEXT("mode"), TEXT("current-game-runtime-probe"));
    Root->SetStringField(TEXT("buildVersion"), FApp::GetBuildVersion());
    Root->SetStringField(TEXT("machineClassPath"), MachineClassPath);
    Root->SetStringField(TEXT("foundationClassPath"), FoundationClassPath);
    Root->SetObjectField(TEXT("machineTransform"), TransformToJson(Machine->GetActorTransform()));
    Root->SetObjectField(TEXT("foundationTransform"), TransformToJson(Foundation->GetActorTransform()));
    Root->SetObjectField(TEXT("sceneBounds"), BoxToJson(SceneBounds));
    Root->SetBoolField(TEXT("autoSaveDisabled"), true);

    const auto ClearanceToJson = [](const AFGBuildable* Buildable)
    {
        TArray<FFGClearanceData> Data;
        Buildable->GetClearanceData_Implementation(Data);
        TArray<TSharedPtr<FJsonValue>> Result;
        for (const FFGClearanceData& Entry : Data)
        {
            if (!Entry.IsValid()) continue;
            TSharedPtr<FJsonObject> Json = MakeShared<FJsonObject>();
            Json->SetNumberField(TEXT("type"), static_cast<uint8>(Entry.Type));
            Json->SetObjectField(TEXT("localBox"), BoxToJson(Entry.ClearanceBox));
            Json->SetObjectField(TEXT("relativeTransform"), TransformToJson(Entry.RelativeTransform));
            Json->SetObjectField(TEXT("actorLocalBox"), BoxToJson(Entry.GetTransformedClearanceBox()));
            Result.Add(MakeShared<FJsonValueObject>(Json));
        }
        return Result;
    };
    Root->SetArrayField(TEXT("machineClearance"), ClearanceToJson(Machine));
    Root->SetArrayField(TEXT("foundationClearance"), ClearanceToJson(Foundation));

    TSet<UMaterialInterface*> Materials;
    const auto InstancesToJson = [&Materials](const AFGBuildable* Buildable)
    {
        TArray<TSharedPtr<FJsonValue>> Result;
        const UAbstractInstanceDataObject* InstanceData = Buildable->GetLightweightInstanceData();
        const TArray<FInstanceData> Instances = InstanceData
            ? InstanceData->GetInstanceData()
            : Buildable->GetActorLightweightInstanceData_Implementation();
        for (const FInstanceData& Instance : Instances)
        {
            TSharedPtr<FJsonObject> Json = MakeShared<FJsonObject>();
            Json->SetStringField(TEXT("staticMesh"), Instance.StaticMesh ? Instance.StaticMesh->GetPathName() : TEXT(""));
            Json->SetObjectField(TEXT("relativeTransform"), TransformToJson(Instance.RelativeTransform));
            Json->SetNumberField(TEXT("numCustomDataFloats"), Instance.NumCustomDataFloats);
            Json->SetNumberField(TEXT("maxWpoDistanceCm"), Instance.MaxWPODistance);
            TArray<TSharedPtr<FJsonValue>> CustomData;
            for (const float Value : Instance.DefaultPerInstanceCustomData) CustomData.Add(MakeShared<FJsonValueNumber>(Value));
            Json->SetArrayField(TEXT("defaultPerInstanceCustomData"), CustomData);
            TArray<FString> MaterialPaths;
            if (Instance.OverridenMaterials.Num() > 0)
            {
                for (UMaterialInterface* Material : Instance.OverridenMaterials)
                {
                    if (Material) { Materials.Add(Material); MaterialPaths.Add(Material->GetPathName()); }
                }
            }
            else if (Instance.StaticMesh)
            {
                for (const FStaticMaterial& Slot : Instance.StaticMesh->GetStaticMaterials())
                {
                    if (Slot.MaterialInterface) { Materials.Add(Slot.MaterialInterface); MaterialPaths.Add(Slot.MaterialInterface->GetPathName()); }
                }
            }
            Json->SetArrayField(TEXT("materials"), StringArrayToJson(MaterialPaths));
            Result.Add(MakeShared<FJsonValueObject>(Json));
        }
        return Result;
    };
    Root->SetArrayField(TEXT("machineInstances"), InstancesToJson(Machine));
    Root->SetArrayField(TEXT("foundationInstances"), InstancesToJson(Foundation));

    TArray<TSharedPtr<FJsonValue>> Components;
    const auto AddComponents = [&Components, &Materials](const AActor* Actor, const FString& OwnerLabel)
    {
        TInlineComponentArray<USceneComponent*> SceneComponents(Actor);
        for (USceneComponent* Component : SceneComponents)
        {
            TSharedPtr<FJsonObject> Json = MakeShared<FJsonObject>();
            Json->SetStringField(TEXT("owner"), OwnerLabel);
            Json->SetStringField(TEXT("name"), Component->GetName());
            Json->SetStringField(TEXT("class"), Component->GetClass()->GetPathName());
            Json->SetObjectField(TEXT("relativeTransform"), TransformToJson(Component->GetRelativeTransform()));
            Json->SetObjectField(TEXT("worldTransform"), TransformToJson(Component->GetComponentTransform()));
            if (const UStaticMeshComponent* StaticMesh = Cast<UStaticMeshComponent>(Component))
            {
                Json->SetStringField(TEXT("staticMesh"), StaticMesh->GetStaticMesh() ? StaticMesh->GetStaticMesh()->GetPathName() : TEXT(""));
            }
            if (const USkeletalMeshComponent* SkeletalMesh = Cast<USkeletalMeshComponent>(Component))
            {
                Json->SetStringField(TEXT("skeletalMesh"), SkeletalMesh->GetSkeletalMeshAsset() ? SkeletalMesh->GetSkeletalMeshAsset()->GetPathName() : TEXT(""));
            }
            if (const UMeshComponent* Mesh = Cast<UMeshComponent>(Component))
            {
                TArray<FString> Paths;
                for (int32 Slot = 0; Slot < Mesh->GetNumMaterials(); ++Slot)
                {
                    if (UMaterialInterface* Material = Mesh->GetMaterial(Slot))
                    {
                        Materials.Add(Material);
                        Paths.Add(Material->GetPathName());
                    }
                }
                Json->SetArrayField(TEXT("materials"), StringArrayToJson(Paths));
            }
            Components.Add(MakeShared<FJsonValueObject>(Json));
        }
    };
    AddComponents(Foundation, TEXT("foundation"));
    AddComponents(Machine, TEXT("machine"));
    Root->SetArrayField(TEXT("components"), Components);

    TArray<TSharedPtr<FJsonValue>> Technical;
    for (UStaticMeshComponent* Mesh : TechnicalMeshes)
    {
        if (!Mesh) continue;
        TSharedPtr<FJsonObject> Json = MakeShared<FJsonObject>();
        Json->SetStringField(TEXT("name"), Mesh->GetName());
        Json->SetStringField(TEXT("staticMesh"), Mesh->GetStaticMesh() ? Mesh->GetStaticMesh()->GetPathName() : TEXT(""));
        Json->SetObjectField(TEXT("worldTransform"), TransformToJson(Mesh->GetComponentTransform()));
        TArray<FString> Paths;
        for (int32 Slot = 0; Slot < Mesh->GetNumMaterials(); ++Slot)
        {
            if (UMaterialInterface* Material = Mesh->GetMaterial(Slot))
            {
                Materials.Add(Material);
                Paths.Add(Material->GetPathName());
            }
        }
        Json->SetArrayField(TEXT("materials"), StringArrayToJson(Paths));
        Technical.Add(MakeShared<FJsonValueObject>(Json));
    }
    Root->SetArrayField(TEXT("technicalMeshes"), Technical);

    TSet<UTexture*> Textures;
    TSet<UTexture*> EffectiveTextures;
    TArray<TSharedPtr<FJsonValue>> MaterialJson;
    for (UMaterialInterface* Material : Materials)
    {
        if (!Material) continue;
        TSharedPtr<FJsonObject> Json = MakeShared<FJsonObject>();
        Json->SetStringField(TEXT("path"), Material->GetPathName());
        Json->SetStringField(TEXT("baseMaterial"), Material->GetMaterial() ? Material->GetMaterial()->GetPathName() : TEXT(""));
        if (const UMaterialInstance* Instance = Cast<UMaterialInstance>(Material))
        {
            Json->SetStringField(TEXT("parent"), Instance->Parent ? Instance->Parent->GetPathName() : TEXT(""));
        }

        TArray<TSharedPtr<FJsonValue>> Scalars;
        TArray<FMaterialParameterInfo> Infos;
        TArray<FGuid> Ids;
        Material->GetAllScalarParameterInfo(Infos, Ids);
        for (const FMaterialParameterInfo& Info : Infos)
        {
            float Value = 0.0f;
            if (!Material->GetScalarParameterValue(FHashedMaterialParameterInfo(Info), Value)) continue;
            TSharedPtr<FJsonObject> Parameter = MakeShared<FJsonObject>();
            Parameter->SetStringField(TEXT("name"), Info.Name.ToString());
            Parameter->SetNumberField(TEXT("association"), static_cast<uint8>(Info.Association));
            Parameter->SetNumberField(TEXT("index"), Info.Index);
            Parameter->SetNumberField(TEXT("value"), Value);
            Scalars.Add(MakeShared<FJsonValueObject>(Parameter));
        }
        Json->SetArrayField(TEXT("scalarParameters"), Scalars);

        Infos.Reset(); Ids.Reset();
        TArray<TSharedPtr<FJsonValue>> Vectors;
        Material->GetAllVectorParameterInfo(Infos, Ids);
        for (const FMaterialParameterInfo& Info : Infos)
        {
            FLinearColor Value;
            if (!Material->GetVectorParameterValue(FHashedMaterialParameterInfo(Info), Value)) continue;
            TSharedPtr<FJsonObject> Parameter = MakeShared<FJsonObject>();
            Parameter->SetStringField(TEXT("name"), Info.Name.ToString());
            Parameter->SetArrayField(TEXT("value"), {
                MakeShared<FJsonValueNumber>(Value.R), MakeShared<FJsonValueNumber>(Value.G),
                MakeShared<FJsonValueNumber>(Value.B), MakeShared<FJsonValueNumber>(Value.A)});
            Vectors.Add(MakeShared<FJsonValueObject>(Parameter));
        }
        Json->SetArrayField(TEXT("vectorParameters"), Vectors);

        Infos.Reset(); Ids.Reset();
        TArray<TSharedPtr<FJsonValue>> TextureParameters;
        Material->GetAllTextureParameterInfo(Infos, Ids);
        for (const FMaterialParameterInfo& Info : Infos)
        {
            UTexture* Value = nullptr;
            if (!Material->GetTextureParameterValue(FHashedMaterialParameterInfo(Info), Value) || !Value) continue;
            Textures.Add(Value);
            TSharedPtr<FJsonObject> Parameter = MakeShared<FJsonObject>();
            Parameter->SetStringField(TEXT("name"), Info.Name.ToString());
            Parameter->SetStringField(TEXT("value"), Value->GetPathName());
            TextureParameters.Add(MakeShared<FJsonValueObject>(Parameter));
        }
        Json->SetArrayField(TEXT("textureParameters"), TextureParameters);

        TArray<UTexture*> UsedTextures;
        // 현재 게임이 실제로 컴파일해 선택한 High/현재 feature-level 분기만 제품 렌더 입력이다.
        // 모든 품질·feature-level을 켜면 비활성 static-switch의 impostor/noise 텍스처까지 섞인다.
        Material->GetUsedTextures(UsedTextures, EMaterialQualityLevel::High, false, GetWorld()->GetFeatureLevel(), false);
        TArray<FString> UsedPaths;
        for (UTexture* Texture : UsedTextures)
        {
            if (Texture)
            {
                Textures.Add(Texture);
                EffectiveTextures.Add(Texture);
                UsedPaths.Add(Texture->GetPathName());
            }
        }
        Json->SetArrayField(TEXT("usedTextures"), StringArrayToJson(UsedPaths));
        MaterialJson.Add(MakeShared<FJsonValueObject>(Json));
    }
    Root->SetArrayField(TEXT("materials"), MaterialJson);

    TArray<TSharedPtr<FJsonValue>> TextureJson;
    for (UTexture* Texture : Textures)
    {
        TSharedPtr<FJsonObject> Json = MakeShared<FJsonObject>();
        Json->SetStringField(TEXT("path"), Texture->GetPathName());
        Json->SetStringField(TEXT("class"), Texture->GetClass()->GetPathName());
        Json->SetBoolField(TEXT("effectiveMaterialUse"), EffectiveTextures.Contains(Texture));
        if (const UTexture2D* Texture2D = Cast<UTexture2D>(Texture))
        {
            const int32 CachedLODBias = FMath::Max(0, Texture2D->GetCachedLODBias());
            Json->SetNumberField(TEXT("sizeX"), Texture2D->GetSizeX());
            Json->SetNumberField(TEXT("sizeY"), Texture2D->GetSizeY());
            Json->SetNumberField(TEXT("numMips"), Texture2D->GetNumMips());
            Json->SetNumberField(TEXT("residentMips"), Texture2D->GetNumResidentMips());
            Json->SetNumberField(TEXT("cachedLodBias"), CachedLODBias);
            Json->SetNumberField(TEXT("maxRuntimeMips"), FMath::Max(1, Texture2D->GetNumMips() - CachedLODBias));
            Json->SetNumberField(TEXT("pixelFormat"), Texture2D->GetPixelFormat());
        }
        else if (const UTexture2DArray* TextureArray = Cast<UTexture2DArray>(Texture))
        {
            const int32 CachedLODBias = FMath::Max(0, TextureArray->GetCachedLODBias());
            Json->SetNumberField(TEXT("sizeX"), TextureArray->GetSizeX());
            Json->SetNumberField(TEXT("sizeY"), TextureArray->GetSizeY());
            Json->SetNumberField(TEXT("numMips"), TextureArray->GetNumMips());
            Json->SetNumberField(TEXT("cachedLodBias"), CachedLODBias);
            Json->SetNumberField(TEXT("maxRuntimeMips"), FMath::Max(1, TextureArray->GetNumMips() - CachedLODBias));
            Json->SetNumberField(TEXT("pixelFormat"), TextureArray->GetPixelFormat());
        }
        TextureJson.Add(MakeShared<FJsonValueObject>(Json));
    }
    Root->SetArrayField(TEXT("textures"), TextureJson);

    FString Output;
    TSharedRef<TJsonWriter<TCHAR, TPrettyJsonPrintPolicy<TCHAR>>> Writer = TJsonWriterFactory<TCHAR, TPrettyJsonPrintPolicy<TCHAR>>::Create(&Output);
    if (!FJsonSerializer::Serialize(Root.ToSharedRef(), Writer)) return false;
    const FString Path = FPaths::Combine(OutputDirectory, TEXT("probe.json"));
    const bool Saved = FFileHelper::SaveStringToFile(Output, *Path, FFileHelper::EEncodingOptions::ForceUTF8WithoutBOM);
    UE_LOG(LogSatisfactoryOpsRenderRig, Display, TEXT("runtime probe saved=%d path=%s"), Saved, *Path);
    return Saved;
}

void ASatisfactoryOpsRenderRig::ConfigureTopCamera(const FBox& WorldBounds)
{
    const FVector Center = WorldBounds.GetCenter();
    Capture->ProjectionType = ECameraProjectionMode::Orthographic;
    Capture->OrthoWidth = FMath::Max(WorldBounds.GetSize().X, WorldBounds.GetSize().Y) * FrameMargin;
    Capture->SetWorldLocation(FVector(Center.X, Center.Y, WorldBounds.Max.Z + WorldBounds.GetExtent().Size() * 3.0f));
    Capture->SetWorldRotation(FRotator(-90.0f, 0.0f, 0.0f));
}

void ASatisfactoryOpsRenderRig::ConfigureIsoCamera(const FBox& WorldBounds, const float AzimuthDegrees)
{
    const FVector Center = WorldBounds.GetCenter();
    const float Radius = WorldBounds.GetExtent().Size();
    const float Elevation = FMath::DegreesToRadians(IsoElevationDegrees);
    const float Azimuth = FMath::DegreesToRadians(AzimuthDegrees);
    const FVector Direction(
        FMath::Cos(Elevation) * FMath::Cos(Azimuth),
        FMath::Cos(Elevation) * FMath::Sin(Azimuth),
        FMath::Sin(Elevation));
    const float Distance = Radius / FMath::Tan(FMath::DegreesToRadians(IsoFieldOfViewDegrees * 0.5f)) * FrameMargin;
    const FVector Location = Center + Direction * Distance;

    Capture->ProjectionType = ECameraProjectionMode::Perspective;
    Capture->FOVAngle = IsoFieldOfViewDegrees;
    Capture->SetWorldLocation(Location);
    Capture->SetWorldRotation(UKismetMathLibrary::FindLookAtRotation(Location, Center));
}

void ASatisfactoryOpsRenderRig::SetTechnicalVisible(const bool bVisible)
{
    for (UStaticMeshComponent* Mesh : TechnicalMeshes)
    {
        if (Mesh)
        {
            Mesh->SetVisibility(bVisible, true);
            Mesh->SetHiddenInGame(!bVisible, true);
        }
    }
}

FBox ASatisfactoryOpsRenderRig::GetWorldClearanceBounds(const AFGBuildable* Buildable) const
{
    FBox Result(EForceInit::ForceInit);
    TArray<FFGClearanceData> Data;
    Buildable->GetClearanceData_Implementation(Data);
    for (const FFGClearanceData& Entry : Data)
    {
        if (Entry.IsValid())
        {
            Result += Entry.GetTransformedClearanceBox().TransformBy(Buildable->GetActorTransform());
        }
    }
    return Result;
}

float ASatisfactoryOpsRenderRig::GetLocalClearanceMinZ(const AFGBuildable* Buildable) const
{
    float Minimum = TNumericLimits<float>::Max();
    TArray<FFGClearanceData> Data;
    Buildable->GetClearanceData_Implementation(Data);
    for (const FFGClearanceData& Entry : Data)
    {
        if (Entry.IsValid())
        {
            Minimum = FMath::Min(Minimum, Entry.GetTransformedClearanceBox().Min.Z);
        }
    }
    return Minimum;
}

float ASatisfactoryOpsRenderRig::GetLocalClearanceMaxZ(const AFGBuildable* Buildable) const
{
    float Maximum = TNumericLimits<float>::Lowest();
    TArray<FFGClearanceData> Data;
    Buildable->GetClearanceData_Implementation(Data);
    for (const FFGClearanceData& Entry : Data)
    {
        if (Entry.IsValid())
        {
            Maximum = FMath::Max(Maximum, Entry.GetTransformedClearanceBox().Max.Z);
        }
    }
    return Maximum;
}
