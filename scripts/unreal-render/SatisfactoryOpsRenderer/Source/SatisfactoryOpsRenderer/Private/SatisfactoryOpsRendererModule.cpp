#include "SatisfactoryOpsRendererModule.h"

#include "Engine/World.h"
#include "FGGameState.h"
#include "HAL/IConsoleManager.h"
#include "HAL/PlatformMisc.h"
#include "Misc/CommandLine.h"
#include "Misc/Parse.h"
#include "SatisfactoryOpsRenderRig.h"

DEFINE_LOG_CATEGORY_STATIC(LogSatisfactoryOpsRenderer, Log, All);

void FSatisfactoryOpsRendererModule::StartupModule()
{
    if (!FParse::Param(FCommandLine::Get(), TEXT("SatisfactoryOpsRender")))
    {
        return;
    }

    PostWorldInitializationHandle = FWorldDelegates::OnPostWorldInitialization.AddRaw(
        this,
        &FSatisfactoryOpsRendererModule::HandlePostWorldInitialization);
    UE_LOG(LogSatisfactoryOpsRenderer, Display, TEXT("렌더 모듈이 현재 게임 장면을 기다립니다."));
}

void FSatisfactoryOpsRendererModule::ShutdownModule()
{
    if (PostWorldInitializationHandle.IsValid())
    {
        FWorldDelegates::OnPostWorldInitialization.Remove(PostWorldInitializationHandle);
    }
    if (StartupTickerHandle.IsValid())
    {
        FTSTicker::GetCoreTicker().RemoveTicker(StartupTickerHandle);
    }
}

void FSatisfactoryOpsRendererModule::HandlePostWorldInitialization(
    UWorld* World,
    const UWorld::InitializationValues InitializationValues)
{
    if (bStarted || !World || World->WorldType != EWorldType::Game || World->GetNetMode() == NM_DedicatedServer)
    {
        return;
    }

    PendingWorld = World;
    if (!StartupTickerHandle.IsValid())
    {
        StartupTickerHandle = FTSTicker::GetCoreTicker().AddTicker(
            FTickerDelegate::CreateRaw(this, &FSatisfactoryOpsRendererModule::TryStartRenderer),
            0.25f);
    }
}

bool FSatisfactoryOpsRendererModule::TryStartRenderer(float DeltaTime)
{
    UWorld* World = PendingWorld.Get();
    if (!World || !World->HasBegunPlay() || !Cast<AFGGameState>(World->GetGameState()))
    {
        return true;
    }

    bStarted = true;
    StartupTickerHandle.Reset();

    ASatisfactoryOpsRenderRig* Rig = World->SpawnActor<ASatisfactoryOpsRenderRig>();
    if (!Rig || !Rig->StartFromCommandLine())
    {
        UE_LOG(LogSatisfactoryOpsRenderer, Error, TEXT("렌더 장면 시작에 실패했습니다."));
        FPlatformMisc::RequestExitWithStatus(true, 21);
    }
    return false;
}

IMPLEMENT_MODULE(FSatisfactoryOpsRendererModule, SatisfactoryOpsRenderer)
